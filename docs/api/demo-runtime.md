# Backend Demo Runtime API

Draft 0.1. This is a temporary evaluator-facing transport for the current frontend integration slice. It is enabled only when `DEMO_RUNTIME_ENABLED=true`, uses the server-side mock Agent and backend fixture inputs, and never writes durable product, wallet, payment, or deployment records. It must not be presented as the production business API.

The frontend uses this boundary so business data no longer lives in browser fixtures. Replacing the demo runtime with the reviewed creator/public APIs is a later implementation step; the page contracts should not depend on this temporary path.

## Routes

| Method | Path | Purpose | Success |
| --- | --- | --- | --- |
| GET | `/api/v1/public/demo/state` | Return the backend-generated evaluator workspace projection, including the Agent proposal, validated DAG, runtime output, API metadata, wallet display state, and settlement display state. | 200 |
| POST | `/api/v1/public/demo/actions` | Run one bounded evaluator action: `agent_plan`, `build`, `api_request`, or `consumer_request`. | 200 |

The action body is strict JSON:

```json
{
  "action": "agent_plan",
  "intent": "Find wallets that traded on both Ethereum and Arbitrum DEX sources during the last 30 complete UTC days.",
  "parameters": {
    "windowDays": 30,
    "minimumActiveDays": 2
  }
}
```

The `intent` and `parameters` properties are optional. The accepted MVP parameter values are fixed to the reviewed cross-chain example. The mock Agent preserves the supplied intent while using the bounded source pair and proposal shape. An action response contains `{ "state": ..., "result": ... }` under `data`. The response metadata uses `dataSource: "demo"` and is not evidence of live Graph, Privy, Hedera, or Blocky402 settlement.

## Safety boundary

- The route is public by design because it powers a local evaluator preview; do not expose funded credentials or signer material through the projection.
- The runtime uses the same bounded Agent harness and deterministic Union/Join execution path as the non-HTTP tests.
- No action performs a Graph request, wallet signature, payment, publication, or database mutation.
- A disabled runtime returns `CAPABILITY_DISABLED`; it does not silently fall back to browser data.
