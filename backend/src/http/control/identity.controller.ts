import type { RequestHandler, Response } from "express";
import {z} from "zod";
import type { AppConfig } from "../../app/config.js";
import type { IdentityService } from "../../modules/identity/service.js";
import type { AuthService } from "../../modules/auth/service.js";
import {
  GraphCredentialConflictError,
  GraphCredentialInputError,
  GraphCredentialNotFoundError,
  GraphCredentialPreconditionError,
  GraphCredentialStorageError,
  GraphCredentialValidationError,
  type GraphCredentialService,
} from "../../modules/graph-credential/index.js";
import type {WalletService} from "../../modules/wallet/service.js";
import {
  HederaAccountError,
  WalletCommandConflictError,
  WalletDelegationError,
  WalletNotFoundError,
  WalletStorageError,
} from "../../modules/wallet/contracts.js";
import { AppError } from "../../shared/errors.js";
import {
  appConfigSchema,
  bootstrapSchema,
  emptyObjectSchema,
  meta,
} from "../contracts/common.js";

export const graphCredentialInputSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(1).max(4096),
});

export const graphCredentialViewSchema = z.strictObject({
  id: z.uuid(),
  label: z.string(),
  provider: z.literal("the_graph"),
  credentialType: z.literal("graph_api_key"),
  ownershipModel: z.literal("customer_supplied"),
  billingModel: z.literal("customer_subscription"),
  publicPrefix: z.string().nullable(),
  fingerprint: z.string(),
  secretVersion: z.string(),
  status: z.enum(["pending_validation", "active", "invalid", "revoked"]),
  isSelected: z.boolean(),
  validatedAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  observedConstraints: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lockVersion: z.number().int().nonnegative(),
});

const readinessSchema = z.strictObject({
  kind: z.enum(["account_wallet", "graph_customer_api_key", "graph_x402", "hedera_recipient"]),
  status: z.enum(["ready", "blocked", "pending", "unavailable"]),
  observedAt: z.iso.datetime().nullable(),
  blockers: z.array(z.strictObject({code: z.string(), message: z.string()})),
});

export const paymentAuthorizationInputSchema = z.strictObject({
  dailyLimitAtomic: z.string().regex(/^[1-9][0-9]{0,77}$/),
});

const walletSignerGrantSchema = z.strictObject({
  id: z.uuid(),
  walletId: z.uuid(),
  provider: z.literal("privy"),
  providerSignerId: z.string(),
  providerPolicyId: z.string(),
  status: z.enum(["pending", "active", "drifted", "revoked", "expired", "failed"]),
  grantedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

const spendingPolicySchema = z.strictObject({
  id: z.uuid(),
  walletSignerGrantId: z.uuid(),
  network: z.string(),
  assetIdentifier: z.string(),
  symbol: z.literal("USDC"),
  decimals: z.literal(6),
  maxPerPeriodAtomic: z.string().regex(/^[1-9][0-9]{0,77}$/),
  periodKind: z.literal("day"),
  periodStartsAt: z.iso.datetime(),
  periodEndsAt: z.iso.datetime(),
  status: z.enum(["draft", "active", "paused", "exhausted", "revoked", "expired"]),
  updatedAt: z.iso.datetime(),
  lockVersion: z.number().int().nonnegative(),
});

export const walletAccessViewSchema = z.strictObject({
  wallets: z.array(z.strictObject({
    id: z.uuid(),
    provider: z.literal("privy"),
    providerWalletId: z.string(),
    providerChainType: z.literal("ethereum"),
    label: z.string().nullable(),
    controlModel: z.literal("user_owned"),
    status: z.enum(["active", "restricted"]),
    addresses: z.array(z.strictObject({
      id: z.uuid(),
      networkId: z.uuid(),
      network: z.string(),
      addressKind: z.enum(["evm", "hedera_account_id", "hedera_evm_address", "hedera_long_zero_address"]),
      address: z.string(),
      networkAccountRef: z.string().nullable(),
      identityStatus: z.enum(["unverified", "resolved", "mismatched"]),
      accountCompletionStatus: z.enum(["not_applicable", "unverified", "hollow", "complete"]),
      controlStatus: z.enum(["unverified", "pending", "verified", "rejected"]),
      canReceive: z.boolean(),
      canSpend: z.boolean(),
      verifiedAt: z.iso.datetime().nullable(),
      status: z.enum(["active", "disabled"]),
    })),
    updatedAt: z.iso.datetime(),
  })),
  credentials: z.array(graphCredentialViewSchema),
  balances: z.array(z.strictObject({
    walletAddressId: z.uuid(),
    networkId: z.uuid(),
    network: z.string(),
    assetIdentifier: z.string(),
    symbol: z.string(),
    decimals: z.number().int().nonnegative(),
    balanceAtomic: z.string().regex(/^(0|[1-9][0-9]{0,77})$/),
    displayAmount: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/),
    observedAt: z.iso.datetime(),
    provider: z.enum(["privy", "hedera_mirror_node"]),
    freshness: z.literal("current"),
  })),
  signerGrants: z.array(walletSignerGrantSchema),
  spendingPolicies: z.array(spendingPolicySchema),
  recipientCapabilities: z.array(z.strictObject({
    walletAddressId: z.uuid(),
    networkId: z.uuid(),
    network: z.string(),
    assetIdentifier: z.string(),
    symbol: z.string(),
    associationStatus: z.literal("not_required"),
    canReceive: z.boolean(),
    canSpend: z.boolean(),
    receiverSignatureRequired: z.boolean().nullable(),
    evidenceSource: z.literal("hedera_mirror_node"),
    status: z.literal("active"),
    observedAt: z.iso.datetime(),
  })),
  readiness: z.array(readinessSchema),
});
export function publicConfiguration(config: AppConfig): RequestHandler {
  const data = appConfigSchema.parse({
    apiVersion: "1",
    environment: config.environment,
    privyAppId: config.privyAppId,
    consolePublicUrl: config.consolePublicUrl,
    dataPublicBaseUrl: config.dataPublicBaseUrl,
    demoProductUrl: config.demoRuntimeEnabled
      ? "/p/cross-chain-dex-trader-footprint"
      : null,
    features: {
      graphCustomerApiKey: Boolean(config.modelCredentialEncryption),
      graphX402: false,
      hederaPublication: false,
      hostedDemoConsumer: config.demoRuntimeEnabled,
      serviceFees: false,
      liveGraphExecution: Boolean(config.privyAppSecret),
    },
  });
  return (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    res.json({ data, meta: meta(res.locals.requestId) });
  };
}

function requireWallets(service?: WalletService): WalletService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function requireGraphCredentials(
  service?: GraphCredentialService,
): GraphCredentialService {
  if (!service) throw new AppError("CAPABILITY_DISABLED");
  return service;
}

function actorUserId(res: Response): string {
  const value = res.locals.workspaceAuthorization?.userId;
  if (typeof value !== "string") throw new AppError("AUTH_REQUIRED");
  return value;
}

function mapCredentialError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof GraphCredentialInputError) {
    throw new AppError("INVALID_REQUEST");
  }
  if (error instanceof GraphCredentialConflictError) {
    throw new AppError("RESOURCE_CONFLICT");
  }
  if (error instanceof GraphCredentialStorageError) {
    throw new AppError("DEPENDENCY_UNAVAILABLE");
  }
  if (error instanceof GraphCredentialNotFoundError) {
    throw new AppError("RESOURCE_NOT_FOUND");
  }
  if (error instanceof GraphCredentialPreconditionError) {
    throw new AppError("PRECONDITION_FAILED");
  }
  if (error instanceof GraphCredentialValidationError) {
    throw new AppError(
      error.reason === "rate_limited" ? "RATE_LIMITED" : "DEPENDENCY_UNAVAILABLE",
    );
  }
  throw new AppError("INTERNAL_ERROR");
}

function expectedLockVersion(value: string | undefined): number {
  const match = /^"([0-9]+)"$/.exec(value ?? "");
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new AppError("INVALID_REQUEST");
  }
  return version;
}

export function readWalletAccess(service?: WalletService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) {
      throw new AppError("INVALID_REQUEST");
    }
    try {
      const data = walletAccessViewSchema.parse(
        await requireWallets(service).readAccess(String(req.params.workspaceId)),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("DEPENDENCY_UNAVAILABLE");
    }
  };
}

export function createHederaAccount(service?: WalletService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.body).success) {
      throw new AppError("INVALID_REQUEST");
    }
    try {
      const data = walletAccessViewSchema.parse(
        await requireWallets(service).activateHedera({
          workspaceId: String(req.params.workspaceId),
          userId: actorUserId(res),
          walletId: String(req.params.walletId),
          idempotencyKey: String(req.get("Idempotency-Key")),
        }),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof WalletNotFoundError) {
        throw new AppError("RESOURCE_NOT_FOUND");
      }
      if (error instanceof WalletCommandConflictError) {
        throw new AppError("RESOURCE_CONFLICT");
      }
      if (error instanceof HederaAccountError) {
        if (error.reason === "not_configured") {
          throw new AppError("CAPABILITY_DISABLED");
        }
        if (error.reason === "quota_exceeded" || error.reason === "destination_unavailable") {
          throw new AppError("RATE_LIMITED");
        }
        throw new AppError("DEPENDENCY_UNAVAILABLE");
      }
      if (error instanceof WalletStorageError) {
        throw new AppError("DEPENDENCY_UNAVAILABLE");
      }
      throw new AppError("INTERNAL_ERROR");
    }
  };
}

export function synchronizePaymentAuthorization(service?: WalletService): RequestHandler {
  return async (req, res) => {
    const parsed = paymentAuthorizationInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = walletAccessViewSchema.parse(
        await requireWallets(service).synchronizePaymentAuthorization({
          workspaceId: String(req.params.workspaceId),
          userId: actorUserId(res),
          walletId: String(req.params.walletId),
          dailyLimitAtomic: parsed.data.dailyLimitAtomic,
        }),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof WalletNotFoundError) throw new AppError("RESOURCE_NOT_FOUND");
      if (error instanceof WalletDelegationError) {
        throw new AppError(
          error.reason === "invalid_limit" ? "INVALID_REQUEST" : "CAPABILITY_DISABLED",
        );
      }
      if (error instanceof WalletStorageError) throw new AppError("DEPENDENCY_UNAVAILABLE");
      throw new AppError("DEPENDENCY_UNAVAILABLE");
    }
  };
}

export function listGraphCredentials(
  service?: GraphCredentialService,
): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success) {
      throw new AppError("INVALID_REQUEST");
    }
    try {
      const data = z.array(graphCredentialViewSchema).parse(
        await requireGraphCredentials(service).list(String(req.params.workspaceId)),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapCredentialError(error);
    }
  };
}

export function createGraphCredential(
  service?: GraphCredentialService,
): RequestHandler {
  return async (req, res) => {
    const parsed = graphCredentialInputSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("INVALID_REQUEST");
    try {
      const data = graphCredentialViewSchema.parse(
        await requireGraphCredentials(service).create(
          String(req.params.workspaceId),
          actorUserId(res),
          parsed.data,
        ),
      );
      res.status(201).json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapCredentialError(error);
    }
  };
}

function credentialMutation(
  operation: "validate" | "select" | "revoke",
  service?: GraphCredentialService,
): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.body).success) {
      throw new AppError("INVALID_REQUEST");
    }
    try {
      const data = graphCredentialViewSchema.parse(
        await requireGraphCredentials(service)[operation](
          String(req.params.workspaceId),
          String(req.params.credentialId),
          expectedLockVersion(req.get("If-Match")),
        ),
      );
      res.json({data, meta: meta(res.locals.requestId)});
    } catch (error) {
      mapCredentialError(error);
    }
  };
}

export function validateGraphCredential(
  service?: GraphCredentialService,
): RequestHandler {
  return credentialMutation("validate", service);
}

export function selectGraphCredential(
  service?: GraphCredentialService,
): RequestHandler {
  return credentialMutation("select", service);
}

export function revokeGraphCredential(
  service?: GraphCredentialService,
): RequestHandler {
  return credentialMutation("revoke", service);
}
export function readIdentity(identity: IdentityService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.query).success)
      throw new AppError("INVALID_REQUEST");
    const data = bootstrapSchema.parse(
      await identity.me(res.locals.identity),
    );
    res.json({ data, meta: meta(res.locals.requestId) });
  };
}

export function bootstrapIdentity(auth: AuthService): RequestHandler {
  return async (req, res) => {
    if (!emptyObjectSchema.safeParse(req.body).success)
      throw new AppError("INVALID_REQUEST");
    const data = bootstrapSchema.parse(
      await auth.bootstrap(res.locals.identity),
    );
    res.json({ data, meta: meta(res.locals.requestId) });
  };
}
