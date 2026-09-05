# Agent Module

Own natural-language planning, approved control commands/outbox and H2 checkpoint/call records. Follow backend/harness before implementing controller/tool dispatch. Do not make direct database fields, paid calls or arbitrary code execution from model output.

Status: ownership boundary only. Domain services/repositories/handlers are not implemented. The owning HTTP routes are reserved and fail closed. Keep domain behavior independent of Express, process environment and hosting providers; inject repositories and provider ports from src/app.

Read [framework.md](../../../framework.md), [data-model.md](../../../../data-model.md) and the domain API documents before enabling handlers. Add state/ownership/idempotency tests with the implementation. No new table or model field is authorized by this placeholder.
