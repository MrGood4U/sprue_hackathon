import type { IdentityVerifier } from "../modules/auth/ports.js";
import { AppError } from "../shared/errors.js";
// Fail closed. No development bypass, decoded-only JWT or browser-supplied subject.
export const unavailableIdentity: IdentityVerifier = {
  async verify() {
    throw new AppError("DEPENDENCY_UNAVAILABLE");
  },
};
