# Authentication Module

This module owns Sprue creator authentication and first-login account bootstrap.

Google OAuth, GitHub OAuth, and MetaMask wallet login are presented by the Privy React SDK. The browser sends the resulting Privy access token as a Bearer token. `privy-verifier.ts` verifies the signed token and derives a provider identity key from its `user_id` claim. This key locates an `auth_identities` binding; it is never used as the Sprue user ID. Browser-supplied user IDs, wallet addresses, and provider labels are not account authority.

`AuthService` creates a stable application-owned user UUID, provider binding, default workspace, and active owner membership through one idempotent PostgreSQL transaction. Repeated bootstrap calls through the same binding return the same local account. Multiple explicitly linked identities may resolve to one user, but automatic linking by email, wallet address, or provider metadata is forbidden. Suspended or closed users cannot create another workspace by signing in again; revoked bindings cannot reactivate themselves.

Authentication does not create, delegate, fund, or authorize the separate creator account wallet used for bounded Graph x402 spending. Wallet and payment authority remain explicit follow-up operations.

The Privy app ID is public. The Privy app secret is server-only and must be supplied through runtime secret configuration. If either value is missing, the API fails closed for creator routes while public product routes remain available.
