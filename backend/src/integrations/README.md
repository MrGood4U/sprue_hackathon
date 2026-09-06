# Provider Adapter Boundary

Production composition currently installs only unavailable-identity.ts, which rejects verification. Setting PRIVY_APP_ID changes public configuration, not verifier availability. Test verifiers are dependency-injected inside tests only; never add a production configuration switch accepting arbitrary user IDs or decoded-only JWTs.

Implement the Privy verification adapter after consulting sponsor/privy.md and current official access-token documentation, validating app audience, issuer, signature, expiry and subject. Wallet signing is a distinct adapter with distinct authority. Graph and Hedera/Blocky402 integrations remain unimplemented. The temporary evaluator runtime has a bounded OpenAI-compatible model port, but durable identity, secret management, metering, rotation, and recovery remain unimplemented. Keep provider clients, secrets and raw errors out of domain modules and HTTP DTOs.
