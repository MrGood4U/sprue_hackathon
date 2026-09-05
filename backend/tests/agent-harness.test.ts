import assert from "node:assert/strict";
import test from "node:test";
import {ConfigError, parseConfig} from "../src/app/config.js";
import {
  AgentHarness,
  AgentModelUnavailableError,
  createAgentModel,
} from "../src/modules/agent/harness/index.js";
import type {SourceInput} from "../src/modules/dag/runtime.js";

const baseEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:local-only@127.0.0.1:1/test",
  API_BASE_URL: "http://127.0.0.1:3001",
  CONSOLE_PUBLIC_URL: "http://127.0.0.1:4173",
  DATA_PUBLIC_BASE_URL: "http://127.0.0.1:3001/data/v1",
  CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
} as const;

const mapping = {
  wallet: "account.id",
  tradeId: "id",
  pool: "pool.id",
  timestamp: "timestamp",
  amountInUsd: "amountInUSD",
  amountOutUsd: "amountOutUSD",
  tokenIn: "tokenIn.id",
  tokenOut: "tokenOut.id",
} as const;

const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const pool = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const tokenIn = "0xcccccccccccccccccccccccccccccccccccccccc";
const tokenOut = "0xdddddddddddddddddddddddddddddddddddddddd";

function source(sourceKey: string, chain: string, id: string, timestamp: string, volume: string): SourceInput {
  return {
    schema: {
      sourceKey,
      chain,
      subgraphId: `${sourceKey}-subgraph`,
      schemaHash: `${sourceKey}-schema-v1`,
      fieldTypes: {
        id: "id",
        "account.id": "address",
        "pool.id": "address",
        timestamp: "timestamp",
        amountInUSD: "decimal",
        amountOutUSD: "decimal",
        "tokenIn.id": "address",
        "tokenOut.id": "address",
      },
    },
    mapping: {sourceKey, chain, fields: mapping},
    rows: [{
      id,
      account: {id: wallet},
      pool: {id: pool},
      timestamp,
      amountInUSD: volume,
      amountOutUSD: volume,
      tokenIn: {id: tokenIn},
      tokenOut: {id: tokenOut},
    }],
  };
}

test("agent configuration supports mock and future remote credentials without exposing them publicly", () => {
  const mock = parseConfig({...baseEnvironment, AGENT_MODE: "mock", AGENT_MODEL: "test-mock"});
  assert.deepEqual(mock.agent, {mode: "mock", apiUrl: null, apiKey: null, model: "test-mock", timeoutMs: 30000});

  const remote = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key", AGENT_MODEL: "test-model", AGENT_TIMEOUT_MS: "5000"});
  assert.equal(remote.agent.apiUrl, "https://agent.example/v1");
  assert.equal(remote.agent.apiKey, "server-only-key");
  assert.throws(() => parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1"}), (error: unknown) => error instanceof ConfigError && error.fields.includes("AGENT_API_KEY"));
});

test("mock Agent harness executes the non-model cross-chain flow", async () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "mock", AGENT_MODEL: "sprue-mock-planner"});
  const model = createAgentModel(config.agent);
  const harness = new AgentHarness(model);
  const result = await harness.run({
    intent: "Find wallets that traded on both Ethereum and Arbitrum during the last 30 complete UTC days.",
    sources: [
      source("uniswap-v3-ethereum", "ethereum", "eth-1", "100", "1.25"),
      source("uniswap-v3-arbitrum", "arbitrum", "arb-1", "200", "2.50"),
    ],
    executionWindow: {startInclusive: "100", endExclusive: "301"},
  });

  assert.equal(result.model.provider, "mock");
  assert.equal(result.proposal.sources.length, 2);
  assert.equal(result.execution.unionRows.length, 2);
  assert.equal(result.execution.crossChain.length, 1);
  assert.equal(result.execution.crossChain[0]!.combinedTradeCount, 2);
  assert.equal(result.execution.crossChain[0]!.combinedVolumeUsd, "3.75");
  assert.deepEqual(result.trace.map((event) => event.stage), [
    "admit", "model", "model", "proposal_validation", "source_mapping", "source_mapping", "dag_execution", "dag_execution", "output",
  ]);
});

test("remote mode is configured but remains fail-closed until its provider adapter is reviewed", () => {
  const config = parseConfig({...baseEnvironment, AGENT_MODE: "remote", AGENT_API_URL: "https://agent.example/v1", AGENT_API_KEY: "server-only-key"});
  assert.throws(() => createAgentModel(config.agent), (error: unknown) => error instanceof AgentModelUnavailableError);
});
