import type { Bootstrap } from "./contracts.js";
// A verified provider subject is not a browser-provided Sprue user or wallet ID.
export interface VerifiedIdentity {
  subject: string;
}
export interface IdentityVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity>;
}
export interface IdentityRepository {
  // Null means no local identity or no owner workspace; bootstrap itself is a separate command.
  findBootstrap(subject: string): Promise<Bootstrap | null>;
  findOwnedWorkspace(
    subject: string,
    workspaceId: string,
  ): Promise<{ userStatus: string; workspaceStatus: string } | null>;
}
