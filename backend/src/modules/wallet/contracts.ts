export const graphFundingNetwork = {
  namespace: "eip155",
  reference: "84532",
  name: "Base Sepolia",
  privyChain: "base_sepolia",
} as const;

export const graphFundingAsset = {
  standard: "erc20",
  identifier: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  symbol: "USDC",
  decimals: 6,
} as const;

export const hederaRevenueNetwork = {
  namespace: "hedera",
  reference: "testnet",
  name: "Hedera Testnet",
} as const;

export const hederaRevenueAsset = {
  standard: "native",
  identifier: "0.0.0",
  symbol: "HBAR",
  decimals: 8,
} as const;

export interface ProviderWallet {
  id: string;
  externalId: string;
  address: string;
  chainType: "ethereum";
  ownerPrivyUserId: string;
}

export interface ProviderBalance {
  chain: string;
  asset: string;
  balanceAtomic: string;
  decimals: number;
  observedAt: Date;
}

export interface ProviderDelegationObservation {
  signerId: string;
  policyId: string;
  definition: {
    walletPolicyIds: readonly string[];
    signerPolicyIds: readonly string[];
  };
  observedAt: Date;
}

export interface PrivyWalletPort {
  findOrCreateUserWallet(input: {
    privyUserId: string;
    sprueUserId: string;
  }): Promise<ProviderWallet>;
  readGraphFundingBalance(walletId: string): Promise<ProviderBalance | null>;
  readDelegatedPaymentAuthorization?(
    walletId: string,
  ): Promise<ProviderDelegationObservation | null>;
}

export interface WalletSignerGrantView {
  id: string;
  walletId: string;
  provider: "privy";
  providerSignerId: string;
  providerPolicyId: string;
  status: "pending" | "active" | "drifted" | "revoked" | "expired" | "failed";
  grantedAt: string | null;
  updatedAt: string;
}

export interface SpendingPolicyView {
  id: string;
  walletSignerGrantId: string;
  network: string;
  assetIdentifier: string;
  symbol: "USDC";
  decimals: 6;
  maxPerPeriodAtomic: string;
  periodKind: "day";
  periodStartsAt: string;
  periodEndsAt: string;
  status: "draft" | "active" | "paused" | "exhausted" | "revoked" | "expired";
  updatedAt: string;
  lockVersion: number;
}

export interface HederaAccountObservation {
  accountId: string;
  evmAddress: string;
  balanceAtomic: string;
  balanceConsensusTimestamp: string | null;
  accountCompletionStatus: "hollow" | "complete";
  receiverSignatureRequired: boolean | null;
  canReceive: boolean;
  canSpend: boolean;
  observedAt: Date;
  activationTransactionId: string | null;
}

export interface HederaAccountPort {
  readonly activationAvailable: boolean;
  readAccount(evmAddress: string): Promise<HederaAccountObservation | null>;
  ensureAccount(evmAddress: string): Promise<HederaAccountObservation>;
}

export type WalletAddressKind =
  | "evm"
  | "hedera_account_id"
  | "hedera_evm_address"
  | "hedera_long_zero_address";

export interface WalletAddressRecord {
  id: string;
  networkId: string;
  network: string;
  addressKind: WalletAddressKind;
  address: string;
  networkAccountRef: string | null;
  identityStatus: "unverified" | "resolved" | "mismatched";
  accountCompletionStatus: "not_applicable" | "unverified" | "hollow" | "complete";
  controlStatus: "unverified" | "pending" | "verified" | "rejected";
  canReceive: boolean;
  canSpend: boolean;
  verifiedAt: Date | null;
  status: "active" | "disabled";
}

export interface AccountWalletRecord {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  provider: "privy";
  providerWalletId: string;
  providerChainType: "ethereum";
  label: string | null;
  controlModel: "user_owned";
  status: "active" | "restricted";
  updatedAt: Date;
  addresses: readonly WalletAddressRecord[];
}

export interface WalletRepository {
  findPrimary(workspaceId: string): Promise<AccountWalletRecord | null>;
  bindProviderWallet(input: {
    workspaceId: string;
    ownerUserId: string;
    wallet: ProviderWallet;
  }): Promise<AccountWalletRecord>;
  appendGraphFundingBalance(input: {
    workspaceId: string;
    walletAddressId: string;
    balance: ProviderBalance;
  }): Promise<void>;
  beginHederaActivation(input: {
    workspaceId: string;
    actorUserId: string;
    walletId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    fingerprintKeyVersion: string;
  }): Promise<{
    commandId: string;
    created: boolean;
    status: "running" | "succeeded" | "failed";
    requestFingerprint: string;
  }>;
  recordHederaAccount(input: {
    workspaceId: string;
    walletId: string;
    observation: HederaAccountObservation;
  }): Promise<AccountWalletRecord>;
  finishHederaActivation(input: {
    commandId: string;
    status: "succeeded" | "failed";
    errorCode?: string;
  }): Promise<void>;
  listSignerGrants(workspaceId: string): Promise<readonly WalletSignerGrantView[]>;
  listSpendingPolicies(workspaceId: string): Promise<readonly SpendingPolicyView[]>;
  synchronizePaymentAuthorization(input: {
    workspaceId: string;
    actorUserId: string;
    walletId: string;
    providerSignerId: string;
    providerPolicyId: string;
    definition: ProviderDelegationObservation["definition"];
    definitionHash: string;
    observedAt: Date;
    dailyLimitAtomic: string;
    periodStartsAt: Date;
    periodEndsAt: Date;
  }): Promise<void>;
}

export interface WalletAccessView {
  wallets: readonly {
    id: string;
    provider: "privy";
    providerWalletId: string;
    providerChainType: "ethereum";
    label: string | null;
    controlModel: "user_owned";
    status: "active" | "restricted";
    addresses: readonly {
      id: string;
      networkId: string;
      network: string;
      addressKind: WalletAddressKind;
      address: string;
      networkAccountRef: string | null;
      identityStatus: "unverified" | "resolved" | "mismatched";
      accountCompletionStatus: "not_applicable" | "unverified" | "hollow" | "complete";
      controlStatus: "unverified" | "pending" | "verified" | "rejected";
      canReceive: boolean;
      canSpend: boolean;
      verifiedAt: string | null;
      status: "active" | "disabled";
    }[];
    updatedAt: string;
  }[];
  balances: readonly {
    walletAddressId: string;
    networkId: string;
    network: string;
    assetIdentifier: string;
    symbol: string;
    decimals: number;
    balanceAtomic: string;
    displayAmount: string;
    observedAt: string;
    provider: "privy" | "hedera_mirror_node";
    freshness: "current";
  }[];
  signerGrants: readonly WalletSignerGrantView[];
  spendingPolicies: readonly SpendingPolicyView[];
  recipientCapabilities: readonly {
    walletAddressId: string;
    networkId: string;
    network: string;
    assetIdentifier: string;
    symbol: string;
    associationStatus: "not_required";
    canReceive: boolean;
    canSpend: boolean;
    receiverSignatureRequired: boolean | null;
    evidenceSource: "hedera_mirror_node";
    status: "active";
    observedAt: string;
  }[];
  readiness: readonly {
    kind: "account_wallet" | "graph_customer_api_key" | "graph_x402" | "hedera_recipient";
    status: "ready" | "blocked" | "pending" | "unavailable";
    observedAt: string | null;
    blockers: readonly {code: string; message: string}[];
  }[];
}

export interface WalletProvisioner {
  ensure(input: {
    workspaceId: string;
    userId: string;
    privyUserId: string;
  }): Promise<AccountWalletRecord>;
}

export class WalletProviderError extends Error {
  constructor() {
    super("WALLET_PROVIDER_UNAVAILABLE");
    this.name = "WalletProviderError";
  }
}

export class WalletDelegationError extends Error {
  constructor(readonly reason: "not_observed" | "unscoped" | "invalid_limit") {
    super(`WALLET_DELEGATION_${reason.toUpperCase()}`);
    this.name = "WalletDelegationError";
  }
}

export class WalletStorageError extends Error {
  constructor() {
    super("WALLET_STORAGE_UNAVAILABLE");
    this.name = "WalletStorageError";
  }
}

export class WalletNotFoundError extends Error {
  constructor() {
    super("WALLET_NOT_FOUND");
    this.name = "WalletNotFoundError";
  }
}

export class WalletCommandConflictError extends Error {
  constructor() {
    super("WALLET_COMMAND_CONFLICT");
    this.name = "WalletCommandConflictError";
  }
}

export type HederaAccountFailureReason =
  | "not_configured"
  | "invalid_wallet_address"
  | "authentication"
  | "destination_unavailable"
  | "quota_exceeded"
  | "timeout"
  | "connection"
  | "server_error"
  | "invalid_response"
  | "unresolved";

export class HederaAccountError extends Error {
  constructor(readonly reason: HederaAccountFailureReason) {
    super(`HEDERA_ACCOUNT_${reason.toUpperCase()}`);
    this.name = "HederaAccountError";
  }
}
