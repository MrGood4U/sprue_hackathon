import {
  InvalidAuthTokenError,
  PrivyClient,
  type VerifyAccessTokenResponse,
} from "@privy-io/node";
import { AppError } from "../../shared/errors.js";
import type { IdentityVerifier } from "./ports.js";

interface AccessTokenVerifier {
  verifyAccessToken(accessToken: string): Promise<VerifyAccessTokenResponse>;
}

export function privyIdentityVerifier(
  appId: string,
  appSecret: string,
  verifier?: AccessTokenVerifier,
): IdentityVerifier {
  const auth =
    verifier ?? new PrivyClient({ appId, appSecret }).utils().auth();

  return {
    async verify(accessToken) {
      try {
        const claims = await auth.verifyAccessToken(accessToken);
        if (
          claims.app_id !== appId ||
          typeof claims.user_id !== "string" ||
          !claims.user_id.trim() ||
          claims.user_id.length > 500
        )
          throw new AppError("AUTH_REQUIRED");
        return { subject: claims.user_id };
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof InvalidAuthTokenError) {
          const message = error.message.toLowerCase();
          if (message.includes("expired")) throw new AppError("AUTH_EXPIRED");
          if (
            message.includes("invalid") ||
            message.includes("payload") ||
            message.includes("parse")
          )
            throw new AppError("AUTH_REQUIRED");
        }
        throw new AppError("DEPENDENCY_UNAVAILABLE");
      }
    },
  };
}
