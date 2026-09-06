import { AppError } from "../../shared/errors.js";
import type { AuthIdentityKey } from "../auth/ports.js";
import type { IdentityRepository } from "./ports.js";
export class IdentityService {
  constructor(private readonly repository: IdentityRepository) {}
  async me(identity: AuthIdentityKey) {
    const result = await this.repository.findBootstrap(identity);
    if (!result) throw new AppError("BOOTSTRAP_REQUIRED");
    if (result.user.status !== "active") throw new AppError("USER_SUSPENDED");
    return result;
  }
  async requireOwner(identity: AuthIdentityKey, workspaceId: string) {
    const result = await this.repository.findOwnedWorkspace(
      identity,
      workspaceId,
    );
    if (!result) throw new AppError("RESOURCE_NOT_FOUND");
    if (result.userStatus !== "active") throw new AppError("USER_SUSPENDED");
    if (result.workspaceStatus !== "active")
      throw new AppError("WORKSPACE_SUSPENDED");
  }
}
