# Deployments Module

Own private endpoint activation, materialization pointers, schedules and publication lifecycle. Activation is a separate creator command. Refresh must compare-and-swap the still-active version and preserve old pointers on failure.

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
