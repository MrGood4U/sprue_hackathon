import {createHash, createHmac} from "node:crypto";
import type {GraphCredentialService} from "../graph-credential/service.js";
import {
  graphFundingAsset,
  graphFundingNetwork,
  hederaRevenueAsset,
  hederaRevenueNetwork,
  type AccountWalletRecord,
  HederaAccountError,
  type HederaAccountObservation,
  type HederaAccountPort,
  type PrivyWalletPort,
  type WalletAccessView,
  WalletCommandConflictError,
  WalletDelegationError,
  WalletNotFoundError,
  type WalletProvisioner,
  type WalletRepository,
} from "./contracts.js";

function displayAtomic(value: string, decimals: number): string {
  const padded = value.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function walletView(wallet: AccountWalletRecord): WalletAccessView["wallets"][number] {
  return {
    id: wallet.id,
    provider: wallet.provider,
    providerWalletId: wallet.providerWalletId,
    providerChainType: wallet.providerChainType,
    label: wallet.label,
    controlModel: wallet.controlModel,
    status: wallet.status,
    addresses: wallet.addresses.map((address) => ({
      ...address,
      verifiedAt: address.verifiedAt?.toISOString() ?? null,
    })),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}

export class WalletService implements WalletProvisioner {
  constructor(
    private readonly repository: WalletRepository,
    private readonly provider: PrivyWalletPort,
    private readonly graphCredentials?: GraphCredentialService,
    private readonly hedera?: {
      provider: HederaAccountPort;
      commandFingerprintKey: Buffer;
      fingerprintKeyVersion: string;
    },
  ) {}

  async synchronizePaymentAuthorization(input: {
    workspaceId: string;
    userId: string;
    walletId: string;
    dailyLimitAtomic: string;
  }): Promise<Awaited<ReturnType<WalletService["readAccess"]>>> {
    const wallet = await this.repository.findPrimary(input.workspaceId);
    if (!wallet || wallet.id !== input.walletId || wallet.ownerUserId !== input.userId) {
      throw new WalletNotFoundError();
    }
    if (
      !/^[1-9][0-9]{0,77}$/.test(input.dailyLimitAtomic)
    ) {
      throw new WalletDelegationError("invalid_limit");
    }
    if (!this.provider.readDelegatedPaymentAuthorization) {
      throw new WalletDelegationError("not_observed");
    }
    const authorization = await this.provider.readDelegatedPaymentAuthorization(
      wallet.providerWalletId,
    );
    if (!authorization) throw new WalletDelegationError("not_observed");
    if (
      !authorization.definition.signerPolicyIds.includes(authorization.policyId) &&
      !authorization.definition.walletPolicyIds.includes(authorization.policyId)
    ) {
      throw new WalletDelegationError("unscoped");
    }
    const now = new Date();
    const periodStartsAt = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ));
    const periodEndsAt = new Date(periodStartsAt);
    periodEndsAt.setUTCDate(periodEndsAt.getUTCDate() + 1);
    const definitionHash = createHash("sha256")
      .update(JSON.stringify(authorization.definition))
      .digest("hex");
    await this.repository.synchronizePaymentAuthorization({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      walletId: input.walletId,
      providerSignerId: authorization.signerId,
      providerPolicyId: authorization.policyId,
      definition: authorization.definition,
      definitionHash,
      observedAt: authorization.observedAt,
      dailyLimitAtomic: input.dailyLimitAtomic,
      periodStartsAt,
      periodEndsAt,
    });
    return this.readAccess(input.workspaceId);
  }

  private hederaView(
    address: AccountWalletRecord["addresses"][number],
    observation: HederaAccountObservation,
  ): {
    balance: WalletAccessView["balances"][number];
    capability: WalletAccessView["recipientCapabilities"][number];
  } {
    return {
      balance: {
        walletAddressId: address.id,
        networkId: address.networkId,
        network: hederaRevenueNetwork.name,
        assetIdentifier: hederaRevenueAsset.identifier,
        symbol: hederaRevenueAsset.symbol,
        decimals: hederaRevenueAsset.decimals,
        balanceAtomic: observation.balanceAtomic,
        displayAmount: displayAtomic(observation.balanceAtomic, hederaRevenueAsset.decimals),
        observedAt: observation.observedAt.toISOString(),
        provider: "hedera_mirror_node",
        freshness: "current",
      },
      capability: {
        walletAddressId: address.id,
        networkId: address.networkId,
        network: hederaRevenueNetwork.name,
        assetIdentifier: hederaRevenueAsset.identifier,
        symbol: hederaRevenueAsset.symbol,
        associationStatus: "not_required",
        canReceive: observation.canReceive,
        canSpend: observation.canSpend,
        receiverSignatureRequired: observation.receiverSignatureRequired,
        evidenceSource: "hedera_mirror_node",
        status: "active",
        observedAt: observation.observedAt.toISOString(),
      },
    };
  }

  async ensure(input: {
    workspaceId: string;
    userId: string;
    privyUserId: string;
  }): Promise<AccountWalletRecord> {
    const existing = await this.repository.findPrimary(input.workspaceId);
    const existingFundingAddress = existing?.addresses.find(
      (address) =>
        address.network === graphFundingNetwork.name &&
        address.status === "active",
    );
    if (existing && existingFundingAddress) return existing;
    const wallet = await this.provider.findOrCreateUserWallet({
      privyUserId: input.privyUserId,
      sprueUserId: input.userId,
    });
    return this.repository.bindProviderWallet({
      workspaceId: input.workspaceId,
      ownerUserId: input.userId,
      wallet,
    });
  }

  async activateHedera(input: {
    workspaceId: string;
    userId: string;
    walletId: string;
    idempotencyKey: string;
  }): Promise<Awaited<ReturnType<WalletService["readAccess"]>>> {
    const wallet = await this.repository.findPrimary(input.workspaceId);
    if (!wallet || wallet.id !== input.walletId || wallet.ownerUserId !== input.userId) {
      throw new WalletNotFoundError();
    }
    if (!this.hedera?.provider.activationAvailable) {
      throw new HederaAccountError("not_configured");
    }
    const fundingAddress = wallet.addresses.find(
      (address) =>
        address.addressKind === "evm" &&
        address.network === graphFundingNetwork.name &&
        address.status === "active",
    );
    if (!fundingAddress) throw new WalletNotFoundError();
    const requestFingerprint = createHmac(
      "sha256",
      this.hedera.commandFingerprintKey,
    )
      .update("activate_hedera_account\0")
      .update(input.workspaceId)
      .update("\0")
      .update(input.walletId)
      .digest("hex");
    const command = await this.repository.beginHederaActivation({
      workspaceId: input.workspaceId,
      actorUserId: input.userId,
      walletId: input.walletId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      fingerprintKeyVersion: this.hedera.fingerprintKeyVersion,
    });
    if (command.requestFingerprint !== requestFingerprint) {
      throw new WalletCommandConflictError();
    }
    if (!command.created) {
      if (command.status === "succeeded") return this.readAccess(input.workspaceId);
      throw new WalletCommandConflictError();
    }

    try {
      const observation = await this.hedera.provider.ensureAccount(fundingAddress.address);
      await this.repository.recordHederaAccount({
        workspaceId: input.workspaceId,
        walletId: input.walletId,
        observation,
      });
      await this.repository.finishHederaActivation({
        commandId: command.commandId,
        status: "succeeded",
      });
      return this.readAccess(input.workspaceId);
    } catch (error) {
      const errorCode = error instanceof HederaAccountError
        ? error.message
        : "HEDERA_ACCOUNT_ACTIVATION_FAILED";
      try {
        await this.repository.finishHederaActivation({
          commandId: command.commandId,
          status: "failed",
          errorCode,
        });
      } catch {
        // Preserve the provider/storage error as the public failure reason.
      }
      throw error;
    }
  }

  async readAccess(workspaceId: string): Promise<WalletAccessView & {
    credentials: Awaited<ReturnType<GraphCredentialService["list"]>>;
  }> {
    const [wallet, signerGrants, spendingPolicies] = await Promise.all([
      this.repository.findPrimary(workspaceId),
      this.repository.listSignerGrants(workspaceId),
      this.repository.listSpendingPolicies(workspaceId),
    ]);
    let currentWallet = wallet;
    const credentials = this.graphCredentials
      ? await this.graphCredentials.list(workspaceId)
      : [];
    const selectedCredential = credentials.find(
      (credential) => credential.isSelected && credential.status === "active",
    );
    const activeCredential = credentials.find(
      (credential) => credential.status === "active",
    );
    const now = new Date();
    const readiness: WalletAccessView["readiness"][number][] = [];
    const balances: WalletAccessView["balances"][number][] = [];
    const recipientCapabilities: WalletAccessView["recipientCapabilities"][number][] = [];
    const address = wallet?.addresses.find(
      (item) => item.network === graphFundingNetwork.name && item.status === "active",
    );
    if (!wallet) {
      readiness.push({
        kind: "account_wallet",
        status: "blocked",
        observedAt: null,
        blockers: [{
          code: "WALLET_NOT_PROVISIONED",
          message: "No Privy account wallet is bound to this workspace.",
        }],
      });
    } else if (!address) {
      readiness.push({
        kind: "account_wallet",
        status: "blocked",
        observedAt: wallet.updatedAt.toISOString(),
        blockers: [{
          code: "WALLET_ADDRESS_UNAVAILABLE",
          message: "The Privy wallet binding has no active Base Sepolia address.",
        }],
      });
    } else {
      readiness.push({
        kind: "account_wallet",
        status: "ready",
        observedAt: wallet.updatedAt.toISOString(),
        blockers: [],
      });
      try {
        const balance = await this.provider.readGraphFundingBalance(
          wallet.providerWalletId,
        );
        if (balance) {
          await this.repository.appendGraphFundingBalance({
            workspaceId,
            walletAddressId: address.id,
            balance,
          });
          balances.push({
            walletAddressId: address.id,
            networkId: address.networkId,
            network: graphFundingNetwork.name,
            assetIdentifier: graphFundingAsset.identifier,
            symbol: graphFundingAsset.symbol,
            decimals: balance.decimals,
            balanceAtomic: balance.balanceAtomic,
            displayAmount: displayAtomic(balance.balanceAtomic, balance.decimals),
            observedAt: balance.observedAt.toISOString(),
            provider: "privy",
            freshness: "current",
          });
        }
      } catch {
        readiness.push({
          kind: "graph_x402",
          status: "unavailable",
          observedAt: now.toISOString(),
          blockers: [{
            code: "PRIVY_BALANCE_UNAVAILABLE",
            message: "Privy could not return the Base Sepolia USDC balance.",
          }],
        });
      }
    }
    if (!readiness.some((item) => item.kind === "graph_x402")) {
      const currentGrantIds = new Set(
        signerGrants.filter((item) => item.status === "pending" || item.status === "active").map((item) => item.id),
      );
      const configuredPolicy = spendingPolicies.some(
        (item) => (item.status === "draft" || item.status === "active") && currentGrantIds.has(item.walletSignerGrantId),
      );
      readiness.push({
        kind: "graph_x402",
        status: balances.length ? "pending" : "blocked",
        observedAt: balances[0]?.observedAt ?? null,
        blockers: [{
          code: balances.length
            ? configuredPolicy
              ? "DELEGATED_GRAPH_SPENDING_UNAVAILABLE"
              : "SPENDING_POLICY_REQUIRED"
            : "BALANCE_UNKNOWN",
          message: balances.length
            ? configuredPolicy
              ? "The wallet grant and daily limit are recorded, but delegated Graph purchase execution is not enabled."
              : "The wallet balance is known, but a Privy signer observation and daily Sprue spending limit are required."
            : "No current Base Sepolia USDC balance observation is available.",
        }],
      });
    }
    const hederaLookupAddress = wallet?.addresses.find(
      (item) => item.addressKind === "hedera_evm_address" && item.status === "active",
    )?.address ?? address?.address ?? null;
    if (!wallet || !hederaLookupAddress) {
      readiness.push({
        kind: "hedera_recipient",
        status: "blocked",
        observedAt: null,
        blockers: [{
          code: "HEDERA_ACCOUNT_REQUIRED",
          message: "A Privy wallet is required before a Hedera testnet account can be created.",
        }],
      });
    } else if (!this.hedera) {
      readiness.push({
        kind: "hedera_recipient",
        status: "unavailable",
        observedAt: null,
        blockers: [{
          code: "HEDERA_FAUCET_NOT_CONFIGURED",
          message: "Hedera testnet account activation is not configured on the server.",
        }],
      });
    } else {
      try {
        const observation = await this.hedera.provider.readAccount(hederaLookupAddress);
        if (!observation) {
          readiness.push({
            kind: "hedera_recipient",
            status: "blocked",
            observedAt: now.toISOString(),
            blockers: [{
              code: this.hedera.provider.activationAvailable
                ? "HEDERA_ACCOUNT_REQUIRED"
                : "HEDERA_FAUCET_NOT_CONFIGURED",
              message: this.hedera.provider.activationAvailable
                ? "No Hedera testnet account is mapped to the Privy wallet yet."
                : "Hedera testnet account activation is not configured on the server.",
            }],
          });
        } else {
          currentWallet = await this.repository.recordHederaAccount({
            workspaceId,
            walletId: wallet.id,
            observation,
          });
          const accountAddress = currentWallet.addresses.find(
            (item) => item.addressKind === "hedera_account_id" && item.status === "active",
          );
          if (!accountAddress) throw new Error("HEDERA_ADDRESS_NOT_STORED");
          const projection = this.hederaView(accountAddress, observation);
          balances.push(projection.balance);
          recipientCapabilities.push(projection.capability);
          const accountComplete = observation.accountCompletionStatus === "complete";
          const controlVerified = accountComplete && observation.canSpend;
          readiness.push({
            kind: "hedera_recipient",
            status: controlVerified ? "ready" : "pending",
            observedAt: observation.observedAt.toISOString(),
            blockers: controlVerified
              ? []
              : [{
                  code: accountComplete
                    ? "HEDERA_CONTROL_UNVERIFIED"
                    : "HEDERA_ACCOUNT_INCOMPLETE",
                  message: accountComplete
                    ? "The Hedera account is complete, but creator-controlled spending has not been verified."
                    : "The Hedera account exists but remains hollow until a compatible signed transaction completes it.",
                }],
          });
        }
      } catch {
        readiness.push({
          kind: "hedera_recipient",
          status: "unavailable",
          observedAt: now.toISOString(),
          blockers: [{
            code: "HEDERA_ACCOUNT_UNAVAILABLE",
            message: "The Hedera Mirror Node could not return the account state.",
          }],
        });
      }
    }
    readiness.push({
      kind: "graph_customer_api_key",
      status: selectedCredential ? "ready" : credentials.length ? "pending" : this.graphCredentials ? "blocked" : "unavailable",
      observedAt: selectedCredential?.updatedAt ?? credentials[0]?.updatedAt ?? null,
      blockers: selectedCredential
        ? []
        : activeCredential
          ? [{code: "CREDENTIAL_SELECTION_REQUIRED", message: "Select one validated Graph API key for future source planning."}]
          : credentials.length
            ? [{code: "CREDENTIAL_VALIDATION_REQUIRED", message: "Validate a saved Graph API key before selecting it."}]
            : [{code: "GRAPH_CREDENTIAL_REQUIRED", message: "No Graph API key is saved for this workspace."}],
    });
    return {
      wallets: currentWallet ? [walletView(currentWallet)] : [],
      credentials,
      balances,
      signerGrants,
      spendingPolicies,
      recipientCapabilities,
      readiness,
    };
  }
}
