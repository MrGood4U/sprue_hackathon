import { AppError } from "../../shared/errors.js";
import type { IdentityRepository } from "./ports.js";
export class IdentityService {
  constructor(private readonly repository: IdentityRepository) {}
  async me(subject: string) {
    const result = await this.repository.findBootstrap(subject);
    if (!result) throw new AppError("BOOTSTRAP_REQUIRED");
    if (result.user.status !== "active") throw new AppError("USER_SUSPENDED");
    return result;
  }
  async requireOwner(subject: string, workspaceId: string) {
    const result = await this.repository.findOwnedWorkspace(
      subject,
      workspaceId,
    );
    if (!result) throw new AppError("RESOURCE_NOT_FOUND");
    if (result.userStatus !== "active") throw new AppError("USER_SUSPENDED");
    if (result.workspaceStatus !== "active")
      throw new AppError("WORKSPACE_SUSPENDED");
  }
}
