import type { Bootstrap } from "../identity/contracts.js";

// Provider-signed identity locates a login binding, never a Sprue user ID.
export interface AuthIdentityKey {
  provider: string;
  subject: string;
}

export type VerifiedIdentity = AuthIdentityKey;

export interface IdentityVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity>;
}

export type AuthBootstrapResult =
  | { kind: "ready"; bootstrap: Bootstrap }
  | { kind: "blocked"; userStatus: "suspended" | "closed" }
  | { kind: "identity_revoked" };

export interface AuthRepository {
  bootstrap(identity: AuthIdentityKey): Promise<AuthBootstrapResult>;
}
