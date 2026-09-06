# Authentication Module

This module owns Sprue creator authentication and first-login account bootstrap.

Google OAuth, GitHub OAuth, and MetaMask wallet login are presented by the Privy React SDK. The browser sends the resulting Privy access token as a Bearer token. `privy-verifier.ts` verifies the signed token and derives the only accepted local account subject from its `user_id` claim. Browser-supplied user IDs, wallet addresses, and provider labels are not account authority.

`AuthService` creates the local user, default workspace, and active owner membership through one idempotent PostgreSQL transaction. It uses the reviewed identity tables and does not introduce a second account store. Repeated bootstrap calls return the same local account. Suspended or closed users cannot create another workspace by signing in again.

Authentication does not create, delegate, fund, or authorize the separate creator account wallet used for bounded Graph x402 spending. Wallet and payment authority remain explicit follow-up operations.

The Privy app ID is public. The Privy app secret is server-only and must be supplied through runtime secret configuration. If either value is missing, the API fails closed for creator routes while public product routes remain available.
