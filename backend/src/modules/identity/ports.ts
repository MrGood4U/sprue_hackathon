import type { Bootstrap } from "./contracts.js";
import type { AuthIdentityKey } from "../auth/ports.js";
export interface IdentityRepository {
  // Null means no local identity or no owner workspace.
  findBootstrap(identity: AuthIdentityKey): Promise<Bootstrap | null>;
  findOwnedWorkspace(
    identity: AuthIdentityKey,
    workspaceId: string,
  ): Promise<{ userStatus: string; workspaceStatus: string } | null>;
}
