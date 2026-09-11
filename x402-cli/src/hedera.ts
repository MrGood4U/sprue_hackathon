import {AccountId, PrivateKey} from "@x402/hedera";
import type {HederaNetwork, WalletConfig} from "./config.js";

export interface HederaAccountObservation {
  accountId: string;
  evmAddress: string | null;
  balanceTinybar: string;
  deleted: boolean;
}

export interface HederaNetworkProfile {
  network: HederaNetwork;
  mirrorNodeUrl: string;
  faucetUrl: string | null;
}

export function networkProfile(network: HederaNetwork): HederaNetworkProfile {
  return network === "hedera:testnet"
    ? {
        network,
        mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
        faucetUrl: "https://portal.hedera.com/api/disbursement/cli",
      }
    : {
        network,
        mirrorNodeUrl: "https://mainnet-public.mirrornode.hedera.com",
        faucetUrl: null,
      };
}

export function parseNetwork(value: string | undefined): HederaNetwork {
  if (!value || value === "testnet" || value === "hedera:testnet") return "hedera:testnet";
  if (value === "mainnet" || value === "hedera:mainnet") return "hedera:mainnet";
  throw new Error("Network must be testnet, mainnet, hedera:testnet, or hedera:mainnet.");
}

export function parseAccountId(value: string): string {
  if (!/^0\.0\.[1-9][0-9]*$/.test(value)) throw new Error("A Hedera account ID such as 0.0.1234 is required.");
  return AccountId.fromString(value).toString();
}

export function parseEcdsaPrivateKey(value: string): PrivateKey {
  const input = value.trim().replace(/^0x/i, "");
  if (!input) throw new Error("The Hedera private key is empty.");
  let privateKey: PrivateKey;
  try {
    privateKey = PrivateKey.fromStringECDSA(input);
  } catch {
    try {
      privateKey = PrivateKey.fromStringDer(input);
    } catch {
      throw new Error("The Hedera private key is not a valid ECDSA key.");
    }
  }
  if (!privateKey.type.toLowerCase().includes("ecdsa")) throw new Error("Only ECDSA Hedera keys are supported.");
  return privateKey;
}

export function publicWalletFromPrivateKey(
  privateKey: PrivateKey,
  network: HederaNetwork,
  accountId: string | null,
  maxPaymentTinybar: string,
): WalletConfig {
  const now = new Date().toISOString();
  return {
    version: 1,
    network,
    accountId,
    evmAddress: `0x${privateKey.publicKey.toEvmAddress().toLowerCase().replace(/^0x/, "")}`,
    publicKey: privateKey.publicKey.toStringRaw(),
    maxPaymentTinybar,
    createdAt: now,
    updatedAt: now,
  };
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Request timeout must be a positive integer.");
  return AbortSignal.timeout(timeoutMs);
}

export async function readHederaAccount(
  identifier: string,
  network: HederaNetwork,
  options: {fetchImpl?: typeof fetch; timeoutMs?: number} = {},
): Promise<HederaAccountObservation | null> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = networkProfile(network).mirrorNodeUrl;
  const response = await fetchImpl(`${baseUrl}/api/v1/accounts/${encodeURIComponent(identifier)}?transactions=false`, {
    headers: {Accept: "application/json"},
    redirect: "error",
    cache: "no-store",
    signal: timeoutSignal(options.timeoutMs ?? 10_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Hedera Mirror Node returned HTTP ${response.status}.`);
  const value = await response.json() as Record<string, unknown>;
  const balance = value.balance as Record<string, unknown> | undefined;
  const accountId = typeof value.account === "string" ? value.account : "";
  const balanceValue = balance?.balance;
  const balanceTinybar = typeof balanceValue === "number" || typeof balanceValue === "string"
    ? String(balanceValue)
    : "";
  if (!/^0\.0\.[1-9][0-9]*$/.test(accountId) || !/^(0|[1-9][0-9]*)$/.test(balanceTinybar)) {
    throw new Error("Hedera Mirror Node returned an invalid account response.");
  }
  const evmAddress = typeof value.evm_address === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.evm_address)
    ? value.evm_address.toLowerCase()
    : null;
  return {
    accountId,
    evmAddress,
    balanceTinybar,
    deleted: value.deleted === true,
  };
}

export async function requestTestnetFaucet(input: {
  evmAddress: string;
  amountHbar: number;
  portalPat: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<string> {
  if (!Number.isInteger(input.amountHbar) || input.amountHbar < 1 || input.amountHbar > 100) {
    throw new Error("The faucet amount must be an integer from 1 through 100 HBAR.");
  }
  if (!input.portalPat.trim()) throw new Error("Set HEDERA_PORTAL_PAT before using the faucet command.");
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(networkProfile("hedera:testnet").faucetUrl!, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.portalPat.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address: input.evmAddress.toLowerCase(),
      amount: input.amountHbar,
      network: "testnet",
    }),
    redirect: "error",
    cache: "no-store",
    signal: timeoutSignal(input.timeoutMs ?? 15_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Hedera Portal faucet returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("Hedera Portal faucet returned invalid JSON.");
  }
  const transactionId = (value as {transactionId?: unknown})?.transactionId;
  if (typeof transactionId !== "string" || !transactionId) throw new Error("Hedera Portal faucet omitted its transaction ID.");
  return transactionId;
}
