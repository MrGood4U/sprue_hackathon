# Dag Module

Own the five-type source/filter/map/aggregate/output registry, deterministic compiler and interpreter. H1 exact executable schemas remain unapproved. Semantic templates compile to primitives; no new runtime type or unrestricted code fallback is enabled.

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
