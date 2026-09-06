import { AppError } from "../../shared/errors.js";
import type { AuthIdentityKey, AuthRepository } from "./ports.js";

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

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
    return result.bootstrap;
  }
}
