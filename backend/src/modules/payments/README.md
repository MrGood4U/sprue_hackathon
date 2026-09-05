# Payments Module

Own separate Graph purchase and Hedera API sale intents/attempts/settlements, proof recovery and financial projections. Consult active sponsor references before adapters. No transfer, fees, hosted buyer or facilitator behavior is enabled by this framework.

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
