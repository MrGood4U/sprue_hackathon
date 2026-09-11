import {createClientHederaSigner, PrivateKey} from "@x402/hedera";
import {ExactHederaScheme} from "@x402/hedera/exact/client";
import {decodePaymentRequiredHeader, decodePaymentResponseHeader} from "@x402/core/http";
import type {PaymentRequired, PaymentRequirements} from "@x402/core/types";
import {wrapFetchWithPayment, x402Client} from "@x402/fetch";
import type {HederaNetwork} from "./config.js";

export interface PaymentChallenge {
  declaration: PaymentRequired;
  requirement: PaymentRequirements;
  amountTinybar: bigint;
}

function requirementIdentity(value: PaymentRequirements): string {
  return JSON.stringify({
    scheme: value.scheme,
    network: value.network,
    asset: value.asset,
    amount: value.amount,
    payTo: value.payTo,
    maxTimeoutSeconds: value.maxTimeoutSeconds,
    extra: value.extra,
  });
}

function compatibleRequirement(
  requirement: PaymentRequirements,
  network: HederaNetwork,
  maxPaymentTinybar: bigint,
): boolean {
  if (requirement.scheme !== "exact" || requirement.network !== network || requirement.asset !== "0.0.0") return false;
  if (!/^(0|[1-9][0-9]*)$/.test(requirement.amount)) return false;
  if (!/^0\.0\.[1-9][0-9]*$/.test(requirement.payTo)) return false;
  if (!Number.isSafeInteger(requirement.maxTimeoutSeconds)
    || requirement.maxTimeoutSeconds < 1 || requirement.maxTimeoutSeconds > 3_600) return false;
  if (!requirement.extra || typeof requirement.extra.feePayer !== "string"
    || !/^0\.0\.[1-9][0-9]*$/.test(requirement.extra.feePayer)) return false;
  const amount = BigInt(requirement.amount);
  return amount > 0n && amount <= maxPaymentTinybar;
}

async function decodeChallenge(response: Response): Promise<PaymentRequired> {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header) {
    try {
      return decodePaymentRequiredHeader(header);
    } catch {
      throw new Error("The endpoint returned an invalid PAYMENT-REQUIRED header.");
    }
  }
  try {
    return await response.clone().json() as PaymentRequired;
  } catch {
    throw new Error("The endpoint returned HTTP 402 without a valid x402 payment declaration.");
  }
}

export async function inspectPaymentChallenge(
  response: Response,
  network: HederaNetwork,
  maxPaymentTinybar: bigint,
): Promise<PaymentChallenge> {
  if (response.status !== 402) throw new Error("A payment challenge requires an HTTP 402 response.");
  const declaration = await decodeChallenge(response);
  if (declaration.x402Version !== 2 || !Array.isArray(declaration.accepts)) {
    throw new Error("The endpoint does not provide an x402 v2 payment declaration.");
  }
  const requirement = declaration.accepts
    .filter((item) => compatibleRequirement(item, network, maxPaymentTinybar))
    .sort((left, right) => {
      const a = BigInt(left.amount);
      const b = BigInt(right.amount);
      return a < b ? -1 : a > b ? 1 : 0;
    })[0];
  if (!requirement) {
    throw new Error(`No Hedera HBAR payment option on ${network} fits the configured per-request limit.`);
  }
  return {declaration, requirement, amountTinybar: BigInt(requirement.amount)};
}

export function createPaidFetch(input: {
  accountId: string;
  privateKey: PrivateKey;
  network: HederaNetwork;
  approvedRequirement: PaymentRequirements;
  fetchImpl?: typeof fetch;
}): typeof fetch {
  const approvedIdentity = requirementIdentity(input.approvedRequirement);
  const signer = createClientHederaSigner(input.accountId, input.privateKey, {network: input.network});
  const client = x402Client.fromConfig({
    schemes: [{network: input.network, client: new ExactHederaScheme(signer)}],
    paymentRequirementsSelector: (_version, requirements) => {
      const selected = requirements.find((requirement) => requirementIdentity(requirement) === approvedIdentity);
      if (!selected) throw new Error("The payment requirement changed after approval. Run the request again.");
      return selected;
    },
    policies: [(_version, requirements) =>
      requirements.filter((requirement) => requirementIdentity(requirement) === approvedIdentity)],
    spendControls: {
      maxAmountPerPayment: false,
      allowedAssets: [{
        network: input.network,
        asset: "0.0.0",
        maxAmountPerPayment: input.approvedRequirement.amount,
      }],
    },
  });
  return wrapFetchWithPayment(input.fetchImpl ?? globalThis.fetch, client) as typeof fetch;
}

export function readPaymentResponse(response: Response): Record<string, unknown> | null {
  const header = response.headers.get("PAYMENT-RESPONSE");
  if (!header) return null;
  try {
    return decodePaymentResponseHeader(header) as unknown as Record<string, unknown>;
  } catch {
    throw new Error("The endpoint returned an invalid PAYMENT-RESPONSE header.");
  }
}
