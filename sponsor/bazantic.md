# Bazantic: Sponsor Reference

Event: ETHOnline 2026

Last checked: 2026-09-05

Status: Prize research complete; technical integration and eligibility not yet verified.

Participation: Start Fresh, confirmed by the user on 2026-09-05. Award A is not applicable; its rules remain below for reference, not as planned work.

Requested reference: [Bazantic prize page](https://ethglobal.com/events/ethonline2026/prizes/bazantic). The individual page could not be retrieved during this review. The digest below was checked against the complete Bazantic section of the [official event prize listing](https://ethglobal.com/events/ethonline2026/prizes), not a third-party summary.

This document separates official conditions from Sprue proposals. Recheck the source before submission; a checklist is not proof of qualification.

## Official Requirements Digest

Source: the Bazantic section of the [official listing](https://ethglobal.com/events/ethonline2026/prizes).

Capabilities: API payment gateways (x402/MPP), MCP servers, custom domains, and Recipes explaining service usage.

Awards total $3,000; shortened labels:

- A: Agent usability, $1,000 (up to two $500 awards), Continuity only.
- B: Sponsor-API Recipe, $1,000 ($500 / $300 / $200).
- C: New API onboarding, $1,000 ($500 / $300 / $200).

Mandatory gates:

- B1 (all): Bazantic account, project gateway, Recipe, and submission username (registration email or GitHub handle).
- B2 (A): Demonstrate Bazantic MCP/Recipe assistance. Compare raw API information against Recipe guidance; keep prompt, model, settings, and API access identical. Only the Recipe changes materially. Submit inputs, both outputs, demonstrated improvement, and comparison video.
- B3 (B): Combine the project with another Bazantic-listed service OR another ETHOnline sponsor API. Both must materially contribute within one Recipe workflow; record the complete execution.
- B4 (C): Add an API absent from Bazantic and other sponsors at event start. Create its working gateway; combine it with the project service in a Recipe. Record execution and explain reuse.

Judging emphasis: repeatable improvement for A; meaningful service interdependence for B; reusable, newly enabled capability for C.

## Recommended Sprue Direction

The following is our assessment, not a final award selection or additional sponsor requirements.

The user clarified that Bazantic is optional publication infrastructure: Sprue first builds and hosts the API, and the creator chooses whether to sell access through x402. The creator's Privy-backed account wallet funds Graph purchases independently and receives API revenue. A possible Sprue service fee is a downstream sales allocation, not a verified Bazantic splitting feature. Recipe award work must support this product boundary.

Prioritize award B for feasibility review under Start Fresh; exclude award A from the current plan. Treat C as a separate scope decision: do not assume that renaming a Graph endpoint or publishing Sprue alone establishes the required service novelty.

A candidate consumer task is to combine a Sprue-derived retention metric with a separate Graph query for current pool liquidity, then explain which pools match a creator's stated criteria. This is only a proposed example; verify actual schemas and metric coverage first. The two calls should answer distinct questions, with their results joined by an explicit identifier.

For our evidence design, removing either input should make the requested result incomplete. A hidden upstream Graph call inside Sprue is not evidence that the Recipe itself orchestrates both services. Validate the concrete flow with the sponsor if this boundary is ambiguous.

Do not add an unrelated data provider merely to pursue C. Confirm the proposed service's eligibility and usefulness before expanding the existing MVP.

## Proposed Integration Boundary

Keep this behind a replaceable publication adapter until a live integration spike succeeds:

- Sprue owns product specifications, transformation execution, refresh jobs, hosted data, and source lineage.
- Bazantic is the optional external publication layer for an already-working hosted endpoint; private use and upstream Graph payment do not require it.
- The consumer-facing description must match the deployed product version, input schema, freshness policy, and access conditions.
- Privy supplies the creator's account wallet for data spending and revenue; Bazantic recipient compatibility and fee collection remain unverified. External buyers need not use Privy.

Proposed consumption path:

```text
Consumer agent following a Recipe
    -> Bazantic public payment endpoint
    -> authenticated Sprue origin
    -> product result with version and freshness
```

This is a design proposal, not a verified request protocol. Sprue's existing x402 runtime sketches describe logical responsibilities; they should not force a second independent payment challenge behind an external gateway.

Our MVP chooses x402. Do not broaden it to another payment protocol unless there is a concrete product need and a validated integration path.

## Development Gates and Evidence

The checks below are Sprue's proposed implementation and submission controls. Only participation-category confirmation is complete; A-specific work is not applicable, and other checks remain pending. Store sanitized evidence in a future `docs/evidence/bazantic/` directory.

| Status | Check | Evidence to preserve | Related gate |
|---|---|---|---|
| [x] | Record the team's participation category | User confirmed Start Fresh on 2026-09-05; A excluded | Award applicability only |
| [ ] | Confirm award choice and remaining eligibility | Team decision and relevant event-rule review | B3-B4 |
| [ ] | Establish the project-service mapping | Service/gateway identifiers, origin route, and configuration without secrets | B1 |
| [ ] | Exercise a separate consumer against the published product | Request trace, payment evidence, returned product version, and origin log correlation | B1; Sprue MVP |
| [ ] | Validate the proposed two-input task | Recipe version, both calls, join key, and explanation of how each input affects the output | B3 |
| N/A | A-specific controlled evaluation | Not planned for Start Fresh | B2 |
| [ ] | If pursuing C, investigate the candidate's provenance | Catalog checks, event-start availability evidence, and sponsor clarification if necessary | B4 |
| [ ] | Assemble the submission evidence index | Links to applicable runs and recordings, plus the owner-confirmed account identifier | B1, B3, B4 as selected |

The paid-request check belongs to Sprue's own MVP definition; do not present it as a separately stated onchain-transaction requirement of every Bazantic award.

### Recipe Design Checklist

This is our proposed authoring template:

- [ ] Define one task and its success condition.
- [ ] Specify chain, time window, units, identifiers, required parameters, and supported product versions.
- [ ] State the ordered calls and how their outputs connect.
- [ ] Explain unavailable, stale, incomplete, and contradictory data.
- [ ] Declare payment limits and stop conditions; never encourage unbounded retries or spending.
- [ ] Show a result that includes provenance and does not confuse a derived metric with a raw onchain fact.
- [ ] Retest the Recipe after any API schema, price, or publication change.

The A evaluation is not planned under Start Fresh. Its methodology can still inform optional internal testing: choose the rubric before observing results, preserve unsuccessful trials, and report uncontrolled service drift rather than attributing every change to the Recipe.

## Technical Unknowns to Resolve

The prize listing does not establish these implementation details:

1. Is gateway and Recipe creation/update available through a supported API or SDK, or only a dashboard? Do not claim one-click provisioning until verified.
2. Which payment networks, assets, x402 versions, settlement paths, and client libraries are supported?
3. Can each product use its own price and recipient? How are settlement records exposed, and can the intended Privy wallet participate?
   Can proceeds be split between the creator and Sprue, or is a separately authorized settlement step needed? Confirm fee basis, provider deductions, rounding, reversals, and payout evidence before implementing a nonzero platform fee.
4. How does Bazantic authenticate to the origin? Test that direct unpaid access is denied; do not rely on a hidden URL.
5. How are request bodies, query parameters, response codes, timeouts, and schema changes handled?
6. What prevents duplicate charging during retries, and what happens when payment succeeds but upstream execution fails?
7. What quotas, fees, data-processing terms, caching rules, and redistribution permissions apply?
8. How are services listed, Recipes shared, and account ownership attributed in the final submission?
9. Can the intended award combination be entered, and how should ambiguous service boundaries be demonstrated?

Start with one bounded, manually configured integration spike if that is the supported workflow, and label it honestly. Account creation, publication, credential use, and paid calls have not been performed during this research.

## Maintenance

Use this reference when changing publication, consumer-agent behavior, or the demo script. Check [The Graph reference](graph.md) separately; meeting one sponsor's gates does not certify another's. Keep material AI-assisted work recorded in [plan.md](../plan.md), and update completion status only when evidence exists.
