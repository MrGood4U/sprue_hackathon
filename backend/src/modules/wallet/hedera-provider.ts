import {z} from "zod";
import type {Logger} from "../../shared/logger.js";
import {
  HederaAccountError,
  type HederaAccountFailureReason,
  type HederaAccountObservation,
  type HederaAccountPort,
} from "./contracts.js";

const evmAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const accountIdPattern = /^0\.0\.[1-9][0-9]*$/;
const mirrorResponseSchema = z.object({
  account: z.string().regex(accountIdPattern),
  balance: z.object({
    balance: z.union([z.number().int().nonnegative(), z.string().regex(/^(0|[1-9][0-9]*)$/)]),
    timestamp: z.string().nullable().optional(),
  }),
  deleted: z.boolean().optional(),
  evm_address: z.string().nullable().optional(),
  key: z.unknown().nullable().optional(),
  receiver_sig_required: z.boolean().nullable().optional(),
});
const faucetResponseSchema = z.object({
  transactionId: z.string().min(1).max(256),
});

type FetchLike = typeof fetch;
type Sleep = (delayMs: number) => Promise<void>;

interface HederaProviderOptions {
  fetchImpl?: FetchLike;
  logger?: Logger;
  requestTimeoutMs?: number;
  reconciliationDelaysMs?: readonly number[];
  sleep?: Sleep;
}

function failureReason(error: unknown): "timeout" | "connection" | "unexpected" {
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof TypeError) return "connection";
  return "unexpected";
}

function statusReason(status: number): HederaAccountFailureReason {
  if (status === 401 || status === 403) return "authentication";
  if (status === 400) return "invalid_wallet_address";
  if (status === 422) return "destination_unavailable";
  if (status === 429) return "quota_exceeded";
  return status >= 500 ? "server_error" : "invalid_response";
}

function logFailureReason(reason: HederaAccountFailureReason) {
  if (reason === "timeout" || reason === "connection" || reason === "server_error" || reason === "invalid_response") {
    return reason;
  }
  if (reason === "quota_exceeded") return "rate_limit" as const;
  return "client_error" as const;
}

async function boundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
    throw new HederaAccountError("invalid_response");
  }
  const body = await response.text();
  if (body.length > 65_536) throw new HederaAccountError("invalid_response");
  try {
    return JSON.parse(body);
  } catch {
    throw new HederaAccountError("invalid_response");
  }
}

export function hederaAccountProvider(
  input: {
    mirrorNodeUrl: string;
    faucetUrl: string;
    portalPat: string | null;
    faucetAmountHbar: number;
  },
  options: HederaProviderOptions = {},
): HederaAccountPort {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const logger = options.logger;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  const reconciliationDelaysMs = options.reconciliationDelaysMs ?? [0, 250, 500, 1_000, 1_500, 2_500, 4_000];
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const mirrorBaseUrl = input.mirrorNodeUrl.replace(/\/$/, "");

  async function request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      return await fetchImpl(url, {...init, signal: controller.signal});
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readAccountAttempt(evmAddress: string): Promise<HederaAccountObservation | null> {
    let response: Response;
    try {
      response = await request(
        `${mirrorBaseUrl}/api/v1/accounts/${encodeURIComponent(evmAddress)}?transactions=false`,
        {
          method: "GET",
          headers: {Accept: "application/json"},
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch (error) {
      const reason = failureReason(error);
      throw new HederaAccountError(reason === "unexpected" ? "connection" : reason);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new HederaAccountError(statusReason(response.status));
    const parsed = mirrorResponseSchema.safeParse(await boundedJson(response));
    if (!parsed.success || parsed.data.deleted) {
      throw new HederaAccountError("invalid_response");
    }
    const returnedAddress = parsed.data.evm_address?.toLowerCase() ?? null;
    if (returnedAddress && returnedAddress !== evmAddress.toLowerCase()) {
      throw new HederaAccountError("invalid_response");
    }
    const balanceAtomic = String(parsed.data.balance.balance);
    if (!/^(0|[1-9][0-9]*)$/.test(balanceAtomic)) {
      throw new HederaAccountError("invalid_response");
    }
    const receiverSignatureRequired = parsed.data.receiver_sig_required ?? null;
    const accountComplete = parsed.data.key != null;
    return {
      accountId: parsed.data.account,
      evmAddress: evmAddress.toLowerCase(),
      balanceAtomic,
      balanceConsensusTimestamp: parsed.data.balance.timestamp ?? null,
      accountCompletionStatus: accountComplete ? "complete" : "hollow",
      receiverSignatureRequired,
      canReceive: receiverSignatureRequired !== true,
      canSpend: accountComplete,
      observedAt: new Date(),
      activationTransactionId: null,
    };
  }

  async function readAccount(evmAddress: string): Promise<HederaAccountObservation | null> {
    if (!evmAddressPattern.test(evmAddress)) {
      throw new HederaAccountError("invalid_wallet_address");
    }
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await readAccountAttempt(evmAddress);
        if (attempt > 1) {
          logger?.write({
            event: "provider_request_recovered",
            provider: "hedera",
            operation: "mirror_account",
            attempts: attempt,
          });
        }
        return result;
      } catch (error) {
        const reason = error instanceof HederaAccountError ? error.reason : "connection";
        const retryable = ["timeout", "connection", "server_error"].includes(reason);
        if (!retryable || attempt === maxAttempts) {
          logger?.write({
            event: "provider_request_failed",
            provider: "hedera",
            operation: "mirror_account",
            attempts: attempt,
            reason: logFailureReason(reason),
            status: null,
            retryable,
            retryExhausted: retryable && attempt === maxAttempts,
          });
          throw error;
        }
        const delayMs = 100 * 2 ** (attempt - 1);
        const retryReason = reason === "timeout" || reason === "connection"
          ? reason
          : "server_error";
        logger?.write({
          event: "provider_retry_scheduled",
          provider: "hedera",
          operation: "mirror_account",
          attempt,
          maxAttempts,
          delayMs,
          reason: retryReason,
          status: null,
        });
        await sleep(delayMs);
      }
    }
    throw new HederaAccountError("connection");
  }

  async function reconcile(
    evmAddress: string,
    activationTransactionId: string | null,
    resolvedOutcome: "created" | "resolved_after_uncertainty",
  ): Promise<HederaAccountObservation | null> {
    for (let attempt = 0; attempt < reconciliationDelaysMs.length; attempt += 1) {
      const delayMs = reconciliationDelaysMs[attempt] ?? 0;
      if (delayMs > 0) await sleep(delayMs);
      try {
        const observation = await readAccount(evmAddress);
        if (observation) {
          logger?.write({
            event: "hedera_account_reconciliation",
            outcome: resolvedOutcome,
            attempts: attempt + 1,
          });
          return {...observation, activationTransactionId};
        }
      } catch (error) {
        if (
          error instanceof HederaAccountError &&
          !["timeout", "connection", "server_error"].includes(error.reason)
        ) throw error;
      }
    }
    logger?.write({
      event: "hedera_account_reconciliation",
      outcome: "unresolved",
      attempts: reconciliationDelaysMs.length,
    });
    return null;
  }

  return {
    activationAvailable: Boolean(input.portalPat),
    readAccount,
    async ensureAccount(evmAddress) {
      const existing = await readAccount(evmAddress);
      if (existing) {
        logger?.write({
          event: "hedera_account_reconciliation",
          outcome: "already_exists",
          attempts: 1,
        });
        return existing;
      }
      if (!input.portalPat) throw new HederaAccountError("not_configured");

      let activationTransactionId: string | null = null;
      let uncertainReason: HederaAccountFailureReason | null = null;
      let faucetStatus: number | null = null;
      try {
        const response = await request(input.faucetUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${input.portalPat}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: evmAddress.toLowerCase(),
            amount: input.faucetAmountHbar,
            network: "testnet",
          }),
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
        });
        faucetStatus = response.status;
        if (!response.ok) {
          const reason = statusReason(response.status);
          if (["authentication", "invalid_wallet_address"].includes(reason)) {
            logger?.write({
              event: "provider_request_failed",
              provider: "hedera",
              operation: "faucet_disbursement",
              attempts: 1,
              reason: logFailureReason(reason),
              status: response.status,
              retryable: false,
              retryExhausted: false,
            });
            throw new HederaAccountError(reason);
          }
          uncertainReason = reason;
        } else {
          const parsed = faucetResponseSchema.safeParse(await boundedJson(response));
          if (!parsed.success) throw new HederaAccountError("invalid_response");
          activationTransactionId = parsed.data.transactionId;
        }
      } catch (error) {
        if (error instanceof HederaAccountError) {
          if (["authentication", "invalid_wallet_address"].includes(error.reason)) {
            throw error;
          }
          uncertainReason = error.reason;
        } else {
          const reason = failureReason(error);
          uncertainReason = reason === "unexpected" ? "connection" : reason;
        }
      }

      if (uncertainReason) {
        logger?.write({
          event: "provider_request_failed",
          provider: "hedera",
          operation: "faucet_disbursement",
          attempts: 1,
          reason: logFailureReason(uncertainReason),
          status: faucetStatus,
          retryable: false,
          retryExhausted: false,
        });
      }

      const reconciled = await reconcile(
        evmAddress,
        activationTransactionId,
        uncertainReason ? "resolved_after_uncertainty" : "created",
      );
      if (reconciled) return reconciled;
      throw new HederaAccountError(uncertainReason ?? "unresolved");
    },
  };
}
