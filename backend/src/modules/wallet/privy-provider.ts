import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  PrivyClient,
  type Wallet,
} from "@privy-io/node";
import type {Logger} from "../../shared/logger.js";
import {
  graphFundingAsset,
  graphFundingNetwork,
  type PrivyWalletPort,
  type ProviderWallet,
  WalletProviderError,
} from "./contracts.js";

interface PrivyWalletClient {
  wallets(): {
    list(query: {
      chain_type: "ethereum";
      external_id: string;
      user_id: string;
    }): AsyncIterable<Wallet>;
    create(input: {
      chain_type: "ethereum";
      display_name: string;
      external_id: string;
      owner: {user_id: string};
      idempotency_key: string;
    }): Promise<Wallet>;
    balance: {
      get(
        walletId: string,
        query: {asset: "usdc"; chain: "base_sepolia"},
      ): Promise<{
        balances: readonly {
          chain: string;
          asset: string;
          raw_value: string;
          raw_value_decimals: number;
        }[];
      }>;
    };
  };
}

type PrivyOperation = "wallet_list" | "wallet_create" | "wallet_balance";
type RetryableReason = "timeout" | "connection" | "rate_limit" | "server_error";
type FailureReason = RetryableReason | "client_error" | "invalid_response" | "unexpected";

interface PrivyWalletProviderOptions {
  logger?: Logger;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

interface FailureClassification {
  reason: FailureReason;
  status: number | null;
  retryable: boolean;
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

function classifyFailure(error: unknown): FailureClassification {
  if (error instanceof APIConnectionTimeoutError)
    return {reason: "timeout", status: null, retryable: true};
  if (error instanceof APIConnectionError)
    return {reason: "connection", status: null, retryable: true};
  if (error instanceof APIError) {
    const status = typeof error.status === "number" ? error.status : null;
    if (status === 429)
      return {reason: "rate_limit", status, retryable: true};
    if (status !== null && status >= 500)
      return {reason: "server_error", status, retryable: true};
    return {reason: "client_error", status, retryable: false};
  }
  if (error instanceof WalletProviderError)
    return {reason: "invalid_response", status: null, retryable: false};
  return {reason: "unexpected", status: null, retryable: false};
}

async function withPrivyRetry<T>(
  operation: PrivyOperation,
  action: () => Promise<T>,
  options: PrivyWalletProviderOptions,
): Promise<T> {
  const logger = options.logger;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 2, 3));
  const baseDelayMs = Math.max(0, Math.min(options.baseDelayMs ?? 250, 2_000));
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await action();
      if (attempt > 1) {
        logger?.write({
          event: "provider_request_recovered",
          provider: "privy",
          operation,
          attempts: attempt,
        });
      }
      return result;
    } catch (error) {
      const failure = classifyFailure(error);
      const shouldRetry = failure.retryable && attempt < maxAttempts;
      if (shouldRetry) {
        const delayMs = baseDelayMs * 2 ** (attempt - 1);
        logger?.write({
          event: "provider_retry_scheduled",
          provider: "privy",
          operation,
          attempt,
          maxAttempts,
          delayMs,
          reason: failure.reason as RetryableReason,
          status: failure.status,
        });
        await sleep(delayMs);
        continue;
      }
      logger?.write({
        event: "provider_request_failed",
        provider: "privy",
        operation,
        attempts: attempt,
        reason: failure.reason,
        status: failure.status,
        retryable: failure.retryable,
        retryExhausted: failure.retryable && attempt === maxAttempts,
      });
      throw error;
    }
  }
  throw new WalletProviderError();
}

function externalId(sprueUserId: string): string {
  return `sprue_${sprueUserId.replaceAll("-", "")}`;
}

function providerWallet(
  wallet: Wallet,
  privyUserId: string,
  expectedExternalId: string,
): ProviderWallet {
  if (
    wallet.chain_type !== "ethereum" ||
    wallet.external_id !== expectedExternalId ||
    !/^0x[a-fA-F0-9]{40}$/.test(wallet.address)
  ) throw new WalletProviderError();
  return {
    id: wallet.id,
    externalId: expectedExternalId,
    address: wallet.address,
    chainType: "ethereum",
    ownerPrivyUserId: privyUserId,
  };
}

export function privyWalletProvider(
  appId: string,
  appSecret: string,
  client?: PrivyWalletClient,
  options: PrivyWalletProviderOptions = {},
): PrivyWalletPort {
  const providerClient = client ?? new PrivyClient({
    appId,
    appSecret,
    maxRetries: 0,
    timeout: 5_000,
  });
  return {
    async findOrCreateUserWallet({privyUserId, sprueUserId}) {
      const expectedExternalId = externalId(sprueUserId);
      try {
        const existing = await withPrivyRetry(
          "wallet_list",
          async () => {
            for await (const wallet of providerClient.wallets().list({
              chain_type: "ethereum",
              external_id: expectedExternalId,
              user_id: privyUserId,
            })) {
              return providerWallet(wallet, privyUserId, expectedExternalId);
            }
            return null;
          },
          options,
        );
        if (existing) return existing;
        return await withPrivyRetry(
          "wallet_create",
          async () => providerWallet(
            await providerClient.wallets().create({
              chain_type: "ethereum",
              display_name: "Sprue account wallet",
              external_id: expectedExternalId,
              owner: {user_id: privyUserId},
              idempotency_key: `sprue-wallet-${sprueUserId}`,
            }),
            privyUserId,
            expectedExternalId,
          ),
          options,
        );
      } catch (error) {
        if (error instanceof WalletProviderError) throw error;
        throw new WalletProviderError();
      }
    },

    async readGraphFundingBalance(walletId) {
      try {
        return await withPrivyRetry(
          "wallet_balance",
          async () => {
            const response = await providerClient.wallets().balance.get(walletId, {
              asset: "usdc",
              chain: graphFundingNetwork.privyChain,
            });
            const balance = response.balances.find(
              (item) =>
                item.chain === graphFundingNetwork.privyChain &&
                item.asset.toLowerCase() === graphFundingAsset.symbol.toLowerCase(),
            );
            if (!balance) return null;
            if (
              !/^(0|[1-9][0-9]{0,77})$/.test(balance.raw_value) ||
              balance.raw_value_decimals !== graphFundingAsset.decimals
            ) throw new WalletProviderError();
            return {
              chain: balance.chain,
              asset: balance.asset,
              balanceAtomic: balance.raw_value,
              decimals: balance.raw_value_decimals,
              observedAt: new Date(),
            };
          },
          options,
        );
      } catch (error) {
        if (error instanceof WalletProviderError) throw error;
        throw new WalletProviderError();
      }
    },
  };
}
