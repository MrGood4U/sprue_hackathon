import type { Bootstrap } from "../identity/contracts.js";

// Provider-signed identity is the only authority for a local account subject.
export interface VerifiedIdentity {
  subject: string;
}

export interface IdentityVerifier {
  verify(accessToken: string): Promise<VerifiedIdentity>;
}

export type AuthBootstrapResult =
  | { kind: "ready"; bootstrap: Bootstrap }
  | { kind: "blocked"; userStatus: "suspended" | "closed" };

export interface AuthRepository {
  bootstrap(subject: string): Promise<AuthBootstrapResult>;
}
