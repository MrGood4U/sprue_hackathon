import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {migrate, readMigrations, type SqlClient} from "../src/db/migrations.js";
import {postgresAgentRepository} from "../src/modules/agent/postgres-repository.js";
import {AgentService} from "../src/modules/agent/service.js";
import type {AgentPlannerFactory} from "../src/modules/agent/contracts.js";

function clientFor(db: PGlite): SqlClient {
  return {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
}

async function fixture(db: PGlite) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const walletId = randomUUID();
  const productId = randomUUID();
  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [userId]);
    await db.query(
      "INSERT INTO workspaces(id,owner_user_id,slug,name,status) VALUES ($1,$2,$3,'Agent workspace','active')",
      [workspaceId, userId, `agent-${workspaceId}`],
    );
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES ($1,$2,'owner','active')",
      [workspaceId, userId],
    );
    await db.query(
      `INSERT INTO account_wallets(
        id,workspace_id,owner_user_id,provider,provider_wallet_id,
        provider_chain_type,provider_owner_id,provider_owner_type,control_model,status
      ) VALUES ($1,$2,$3,'privy',$4,'ethereum',$5,'user','user_owned','active')`,
      [walletId, workspaceId, userId, `wallet-${walletId}`, `did:privy:${userId}`],
    );
    await db.query(
      `INSERT INTO data_products(
        id,workspace_id,creator_user_id,account_wallet_id,slug,name,
        original_intent,status
      ) VALUES ($1,$2,$3,$4,$5,'Live Agent product','','draft')`,
      [productId, workspaceId, userId, walletId, `agent-product-${productId.slice(0, 8)}`],
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return {userId, workspaceId, productId};
}

test("Agent sessions persist real planner input, evidence summary, trace, and replay", async () => {
  const db = new PGlite();
  try {
    await migrate(clientFor(db), await readMigrations());
    const ids = await fixture(db);
    let planningCalls = 0;
    let releasePlanning!: () => void;
    const planningGate = new Promise<void>((resolve) => { releasePlanning = resolve; });
    const plannerFactory: AgentPlannerFactory = (factoryInput) => ({
      async explore() {
        planningCalls += 1;
        factoryInput.traceSink?.({sequenceNo: 1, stage: "admit", status: "passed", summary: "Intent admitted"});
        await planningGate;
        factoryInput.traceSink?.({sequenceNo: 2, stage: "graph_source_discovery", status: "passed", summary: "Sources inspected"});
        return {
          kind: "feasibility",
          readyForCompilation: false,
          discoveryPlan: {semanticPlan: {summary: "Find wallets active across Ethereum and Arbitrum."}},
          sourceNeeds: [
            {id: "need-ethereum", dataNetwork: "eip155:1"},
            {id: "need-arbitrum", dataNetwork: "eip155:42161"},
          ],
          discovery: {
            searchCalls: 2,
            inspectedSchemas: 2,
            candidates: [
              {
                candidateRef: "graph:eth:one",
                sourceNeedId: "need-ethereum",
                displayName: "Ethereum swaps",
                logicalSubgraphId: "subgraph-eth",
                manifestIpfsCid: "QmEthereum",
                status: "suitable",
                entities: [{queryEntity: "swaps", fields: [], matchedRequirements: ["wallet", "trade_id", "timestamp", "volume_usd"]}],
                totalQueryCount30d: 42,
                limitations: ["Coverage requires validation."],
              },
              {
                candidateRef: "graph:arb:one",
                sourceNeedId: "need-arbitrum",
                displayName: "Arbitrum swaps",
                logicalSubgraphId: "subgraph-arb",
                manifestIpfsCid: "QmArbitrum",
                status: "needs_verification",
                entities: [{queryEntity: "swaps", fields: [], matchedRequirements: ["wallet", "trade_id", "timestamp", "volume_usd"]}],
                totalQueryCount30d: 20,
                limitations: ["Deployment ID requires admission."],
              },
            ],
          },
          feasibility: {
            assumptions: [],
            selections: [
              {sourceNeedId: "need-ethereum", candidateRef: "graph:eth:one", queryEntity: "swaps", fieldBindings: [
                {requirementId: "wallet", fieldPath: "account.id"},
                {requirementId: "trade_id", fieldPath: "id"},
                {requirementId: "timestamp", fieldPath: "timestamp"},
                {requirementId: "volume_usd", fieldPath: "amountUSD"},
              ], rationale: "Field fit"},
              {sourceNeedId: "need-arbitrum", candidateRef: "graph:arb:one", queryEntity: "swaps", fieldBindings: [
                {requirementId: "wallet", fieldPath: "account.id"},
                {requirementId: "trade_id", fieldPath: "id"},
                {requirementId: "timestamp", fieldPath: "timestamp"},
                {requirementId: "volume_usd", fieldPath: "amountUSD"},
              ], rationale: "Field fit"},
            ],
            composition: {
              nodes: [{role: "join", operator: "join"}],
              connections: [{fromRole: "left", toRole: "join", inputRole: "left"}],
            },
          },
          blockers: ["Coverage remains unverified."],
          trace: [
            {sequenceNo: 1, stage: "admit", status: "passed", summary: "Intent admitted"},
            {sequenceNo: 2, stage: "graph_source_discovery", status: "passed", summary: "Sources inspected"},
          ],
          model: {provider: "remote", model: "test-model", calls: 2},
        } as never;
      },
      async close() {},
    });
    const service = new AgentService(
      postgresAgentRepository(clientFor(db)),
      {resolve: async () => ({mode: "remote", apiUrl: "https://model.example/v1/chat/completions", apiKey: "model-key", model: "test-model", timeoutMs: 5000})},
      {
        list: async () => [{id: randomUUID(), isSelected: true, status: "active"}] as never,
        resolve: async () => "graph-key",
      } as never,
      Buffer.alloc(32, 3),
      "test-agent-v1",
      plannerFactory,
    );

    const session = await service.createSession({
      workspaceId: ids.workspaceId,
      actorUserId: ids.userId,
      productId: ids.productId,
      title: "Cross-chain plan",
      idempotencyKey: "create-agent-session-0001",
    });
    assert.equal(session.productId, ids.productId);

    const request = {
      workspaceId: ids.workspaceId,
      sessionId: session.id,
      actorUserId: ids.userId,
      contentText: "Find wallets active on Ethereum and Arbitrum.",
      idempotencyKey: "submit-agent-message-0001",
    };
    const pendingCompletion = service.submitMessage(request);
    let activeTrace = await service.listActiveTrace(ids.workspaceId, session.id, 0, 100);
    for (let attempt = 0; activeTrace.items.length === 0 && attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeTrace = await service.listActiveTrace(ids.workspaceId, session.id, 0, 100);
    }
    assert.equal(activeTrace.streamStatus, "open");
    assert.equal(activeTrace.items.length, 1);
    assert.equal(activeTrace.items[0]?.summary, "Intent admitted");
    assert.equal(activeTrace.nextAfterSequence, "1");
    releasePlanning();
    const completed = await pendingCompletion;
    assert.equal(completed.status, "succeeded");
    const replayed = await service.submitMessage(request);
    assert.equal(replayed.commandId, completed.commandId);
    assert.equal(planningCalls, 1);

    const messages = await service.listMessages(ids.workspaceId, session.id, 0, 50);
    assert.equal(messages.items.length, 2);
    assert.equal(messages.items[0]?.contentText, request.contentText);
    assert.equal(messages.items[1]?.modelProvider, "remote");
    assert.equal(messages.items[1]?.contentJson?.kind, "proposal");
    const initializedProduct = await db.query<{original_intent: string; lock_version: number}>(
      "SELECT original_intent,lock_version FROM data_products WHERE id=$1",
      [ids.productId],
    );
    assert.equal(initializedProduct.rows[0]?.original_intent, request.contentText);
    assert.equal(initializedProduct.rows[0]?.lock_version, 1);
    const checkpoint = await db.query<{window_seconds: number}>(
      `SELECT extract(epoch FROM (pc.deadline_at-c.created_at))::int AS window_seconds
       FROM planning_checkpoints pc JOIN control_commands c ON c.id=pc.control_command_id
       WHERE c.id=$1`,
      [completed.commandId],
    );
    assert.equal(checkpoint.rows[0]?.window_seconds, 3600);
    if (messages.items[1]?.contentJson?.kind === "proposal") {
      assert.equal(messages.items[1].contentJson.sourceEvidence.length, 2);
      assert.equal(messages.items[1].contentJson.readyForCompilation, false);
      assert.equal(Number.isInteger(messages.items[1].contentJson.durationMs), true);
      assert.equal(messages.items[1].contentJson.durationMs >= 0, true);
    }
    const traceCount = await db.query<{count: number}>("SELECT count(*)::int AS count FROM trace_events");
    assert.equal(traceCount.rows[0]?.count, 2);
    const closedTrace = await service.listActiveTrace(ids.workspaceId, session.id, 0, 100);
    assert.equal(closedTrace.traceStreamId, null);
    assert.deepEqual(closedTrace.items, []);
    const streamCount = await db.query<{count: number}>("SELECT count(*)::int AS count FROM trace_streams");
    assert.equal(streamCount.rows[0]?.count, 1);
  } finally {
    await db.close();
  }
});

test("Agent planning enforces the whole-run deadline and persists a retryable terminal result", async () => {
  const db = new PGlite();
  try {
    await migrate(clientFor(db), await readMigrations());
    const ids = await fixture(db);
    const plannerFactory: AgentPlannerFactory = () => ({
      async explore(_input, signal) {
        await new Promise<never>((_resolve, reject) => {
          const failOnAbort = () => reject(signal?.reason ?? new Error("aborted"));
          if (signal?.aborted) failOnAbort();
          else signal?.addEventListener("abort", failOnAbort, {once: true});
        });
        throw new Error("unreachable");
      },
      async close() {},
    });
    const service = new AgentService(
      postgresAgentRepository(clientFor(db)),
      {resolve: async () => ({mode: "remote", apiUrl: "https://model.example/v1/chat/completions", apiKey: "model-key", model: "test-model", timeoutMs: 5000})},
      {
        list: async () => [{id: randomUUID(), isSelected: true, status: "active"}] as never,
        resolve: async () => "graph-key",
      } as never,
      Buffer.alloc(32, 7),
      "test-agent-timeout-v1",
      plannerFactory,
      undefined,
      false,
      "mainnet",
      undefined,
      25,
    );
    const session = await service.createSession({
      workspaceId: ids.workspaceId,
      actorUserId: ids.userId,
      productId: ids.productId,
      title: "Timed plan",
      idempotencyKey: "create-agent-timeout-session-0001",
    });

    const command = await service.submitMessage({
      workspaceId: ids.workspaceId,
      sessionId: session.id,
      actorUserId: ids.userId,
      contentText: "Inspect a deliberately slow planning run.",
      idempotencyKey: "submit-agent-timeout-message-0001",
    });

    assert.equal(command.status, "failed");
    const messages = await service.listMessages(ids.workspaceId, session.id, 0, 10);
    assert.equal(messages.items[1]?.contentJson?.kind, "error");
    if (messages.items[1]?.contentJson?.kind === "error") {
      assert.equal(messages.items[1].contentJson.code, "AGENT_RUN_TIMEOUT");
      assert.equal(messages.items[1].contentJson.retryable, true);
    }
  } finally {
    await db.close();
  }
});
