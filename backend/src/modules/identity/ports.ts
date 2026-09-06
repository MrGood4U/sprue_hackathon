import type { Bootstrap } from "./contracts.js";
export interface IdentityRepository {
  // Null means no local identity or no owner workspace.
  findBootstrap(subject: string): Promise<Bootstrap | null>;
  findOwnedWorkspace(
    subject: string,
    workspaceId: string,
  ): Promise<{ userStatus: string; workspaceStatus: string } | null>;
}
