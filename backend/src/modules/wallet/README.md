# Wallet Module

Own account-wallet observations, policy/signature-grant references, funding views and authoritative Graph budget transactions. Consult sponsor/privy.md before provider work. Do not hold creator keys or imply user-enforced policy without evidence.

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
