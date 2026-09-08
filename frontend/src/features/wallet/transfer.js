import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddress,
} from "viem";
import { baseSepolia, hederaTestnet } from "./chains.js";

export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const MAX_EVM_ACCOUNT_NUMBER = (1n << 160n) - 1n;

const TRANSFER_PROFILES = Object.freeze({
  baseSepoliaUsdc: {
    chain: baseSepolia,
    network: "Base Sepolia",
    symbol: "USDC",
    assetIdentifier: BASE_SEPOLIA_USDC_ADDRESS,
    decimals: 6,
    kind: "erc20",
  },
  hederaTestnetHbar: {
    chain: hederaTestnet,
    network: "Hedera Testnet",
    symbol: "HBAR",
    assetIdentifier: "0.0.0",
    decimals: 8,
    evmDecimals: 18,
    kind: "native",
  },
});

export class TransferValidationError extends Error {
  constructor(code, field = null) {
    super(code);
    this.name = "TransferValidationError";
    this.code = code;
    this.field = field;
  }
}

function requireAtomicInteger(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value ?? ""))) {
    throw new TransferValidationError("BALANCE_INVALID");
  }
  return BigInt(value);
}

export function parseExactAmount(value, decimals) {
  const normalized = String(value ?? "").trim();
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(normalized);
  if (!match) throw new TransferValidationError("AMOUNT_INVALID", "amount");

  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new TransferValidationError("AMOUNT_PRECISION", "amount");
  }

  const atomic = BigInt(match[1]) * (10n ** BigInt(decimals))
    + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (atomic <= 0n) throw new TransferValidationError("AMOUNT_POSITIVE", "amount");
  return atomic;
}

export function hederaAccountIdToEvmAddress(accountId) {
  const match = /^0\.0\.(0|[1-9][0-9]*)$/.exec(String(accountId ?? "").trim());
  if (!match) throw new TransferValidationError("DESTINATION_INVALID", "destination");
  const accountNumber = BigInt(match[1]);
  if (accountNumber === 0n || accountNumber > MAX_EVM_ACCOUNT_NUMBER) {
    throw new TransferValidationError("DESTINATION_INVALID", "destination");
  }
  return getAddress(`0x${accountNumber.toString(16).padStart(40, "0")}`);
}

export function normalizeTransferDestination(value, profile) {
  const destination = String(value ?? "").trim();
  if (profile.kind === "native" && destination.startsWith("0.0.")) {
    return hederaAccountIdToEvmAddress(destination);
  }
  if (!isAddress(destination, { strict: false })) {
    throw new TransferValidationError("DESTINATION_INVALID", "destination");
  }
  let normalized;
  try {
    normalized = getAddress(destination);
  } catch {
    throw new TransferValidationError("DESTINATION_INVALID", "destination");
  }
  if (/^0x0{40}$/i.test(normalized)) {
    throw new TransferValidationError("DESTINATION_INVALID", "destination");
  }
  return normalized;
}

export function resolveTransferProfile(balance) {
  const matchingProfile = Object.values(TRANSFER_PROFILES).find((profile) => (
    balance?.network === profile.network
      && balance?.symbol === profile.symbol
      && Number(balance?.decimals) === profile.decimals
      && String(balance?.assetIdentifier ?? "").toLowerCase() === profile.assetIdentifier.toLowerCase()
  ));
  if (!matchingProfile) throw new TransferValidationError("ASSET_UNSUPPORTED");
  return matchingProfile;
}

export function hasSpendableBalance(balance) {
  try {
    return requireAtomicInteger(balance?.balanceAtomic) > 0n;
  } catch {
    return false;
  }
}

export function prepareWalletTransfer({ balance, destination, amount }) {
  const profile = resolveTransferProfile(balance);
  const amountAtomic = parseExactAmount(amount, profile.decimals);
  const balanceAtomic = requireAtomicInteger(balance.balanceAtomic);
  if (amountAtomic > balanceAtomic) {
    throw new TransferValidationError("AMOUNT_EXCEEDS_BALANCE", "amount");
  }
  if (profile.kind === "native" && amountAtomic === balanceAtomic) {
    throw new TransferValidationError("AMOUNT_REQUIRES_FEE_RESERVE", "amount");
  }

  const normalizedDestination = normalizeTransferDestination(destination, profile);
  const transaction = profile.kind === "erc20"
    ? {
        chainId: profile.chain.id,
        to: profile.assetIdentifier,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [normalizedDestination, amountAtomic],
        }),
        value: 0n,
      }
    : {
        chainId: profile.chain.id,
        to: normalizedDestination,
        value: amountAtomic * (10n ** BigInt(profile.evmDecimals - profile.decimals)),
      };

  return {
    profile,
    transaction,
    amountAtomic,
    displayAmount: formatUnits(amountAtomic, profile.decimals),
    destination: normalizedDestination,
  };
}

export async function waitForTransferReceipt(profile, hash, { timeout = 45_000 } = {}) {
  try {
    const client = createPublicClient({ chain: profile.chain, transport: http() });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout });
    return receipt.status === "success" ? "confirmed" : "reverted";
  } catch {
    return "submitted";
  }
}

export function transferEvidenceUrl(profile, hash) {
  if (!hash) return null;
  if (profile.chain.id === hederaTestnet.id) {
    return `https://testnet.mirrornode.hedera.com/api/v1/contracts/results/${hash}`;
  }
  return `${profile.chain.blockExplorers.default.url}/tx/${hash}`;
}
