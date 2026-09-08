# Backend Demo Runtime API

Draft 0.6. This is a temporary evaluator-facing transport for the current frontend integration slice. It is enabled only when `DEMO_RUNTIME_ENABLED=true`, uses backend fixture inputs, and never writes durable product, wallet, payment, or deployment records. It must not be presented as the production business API.

The frontend uses this boundary so business data no longer lives in browser fixtures. Replacing the demo runtime with the reviewed creator/public APIs is a later implementation step; the page contracts should not depend on this temporary path.

## Routes

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/public/demo/state` | Return an immutable public evaluator projection with no creator model profile or unpublished workspace state. | 200 |
| POST | `/api/v1/public/demo/actions` | Run only the bounded public `consumer_request` demonstration. | 200 |
| GET | `/api/v1/workspaces/{workspaceId}/demo/state` | Return the creator projection for an authenticated and owner-authorized workspace. | 200 |
| POST | `/api/v1/workspaces/{workspaceId}/demo/actions` | Run `agent_plan`, `rename_product`, `build`, or `api_request` for the authorized workspace. | 200 |

All workspace routes require `Authorization: Bearer <provider access token>`. The backend verifies the token, resolves the provider subject to a Sprue user, and confirms that user owns the path workspace before the handler can read or mutate in-memory state. The path workspace ID is a selector, not identity evidence. An unauthorized or foreign workspace returns the same not-found boundary used by durable creator routes.

Action bodies are strict and action-specific. Agent planning accepts an optional intent:

```json
{
  "action": "agent_plan",
  "intent": "Find wallets that traded on both Ethereum and Arbitrum DEX sources during the last 30 complete UTC days."
}
```

Build accepts only the reviewed fixed MVP parameters. Product renaming accepts one trimmed name from 1 through 120 characters:

```json
{
  "action": "rename_product",
  "name": "New Product"
}
```

The resulting name is retained only in API-process memory for the authorized workspace and is projected consistently into that workspace's Dashboard and product views. It is cleared on API restart and does not create or update a durable product row.

API testing accepts the generated endpoint's bounded `limit` parameter:

```json
{
  "action": "api_request",
  "parameters": {"limit": 100}
}
```

`limit` is an optional integer with a default of 100, minimum of 1, and maximum of 1000. It selects the first N rows from the deterministic demo output. The state projection publishes this request definition, the response field paths, media type, and a clearly demo-labeled example response so the API page can render a backend-owned contract. It intentionally omits the former deployment-evidence projection.

Without a workspace model profile, the mock Agent preserves the supplied intent while using the bounded source pair and proposal shape. With the durable profile documented in [model-service.md](model-service.md), the next creator `agent_plan` action calls that model and applies the same proposal and DAG validation before returning state. Other creator actions reuse the last validated workspace proposal and do not create additional model charges. An action response contains `{ "state": ..., "result": ... }` under `data`. The response metadata uses `dataSource: "demo"` and is not evidence of live Graph, Privy, Hedera, or Blocky402 settlement.

## Safety boundary

- Only the immutable state projection and simulated consumer request are public. Creator actions and model settings require an authenticated, owner-authorized workspace.
- Model settings use the separate authenticated durable Model Service resource; the demo transport does not expose a model-profile route.
- Remote model requests send only the natural-language intent and bounded source/schema summaries. Provider output is untrusted and must pass the same structured-proposal, operator-allowlist, and DAG checks as mock output.
- A connection test is an explicit provider call, not passive validation. It sends only a fixed connectivity prompt, never saves provider content, and remains separate from `Save configuration` and `Generate plan`.
- The runtime uses the same bounded Agent harness and deterministic Union/Join execution path as the non-HTTP tests.
- No demo action performs a Graph request, wallet signature, payment, publication, or durable product mutation.
- A disabled runtime returns `CAPABILITY_DISABLED`; it does not silently fall back to browser data.
