import { AppError } from "../../shared/errors.js";
import type {Logger} from "../../shared/logger.js";
import {
  WalletProviderError,
  WalletStorageError,
  type WalletProvisioner,
} from "../wallet/contracts.js";
import type { AuthIdentityKey, AuthRepository } from "./ports.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly wallets?: WalletProvisioner,
    private readonly logger?: Logger,
  ) {}

  async bootstrap(identity: AuthIdentityKey) {
    if (
      !/^[a-z][a-z0-9_]{0,31}$/.test(identity.provider) ||
      !identity.subject.trim() ||
      identity.subject.length > 500
    )
      throw new AppError("AUTH_REQUIRED");
    const result = await this.repository.bootstrap(identity);
    if (result.kind === "identity_revoked") throw new AppError("AUTH_REQUIRED");
    if (result.kind === "blocked") throw new AppError("USER_SUSPENDED");
    if (this.wallets && identity.provider === "privy") {
      try {
        await this.wallets.ensure({
          workspaceId: result.bootstrap.defaultWorkspaceId,
          userId: result.bootstrap.user.id,
          privyUserId: identity.subject,
        });
      } catch (error) {
        this.logger?.write({
          event: "wallet_bootstrap_failed",
          provider: "privy",
          stage: error instanceof WalletProviderError
            ? "provider"
            : error instanceof WalletStorageError
              ? "storage"
              : "unexpected",
        });
        throw new AppError("DEPENDENCY_UNAVAILABLE");
      }
    }
    return result.bootstrap;
  }
}
