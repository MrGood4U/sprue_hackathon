import assert from "node:assert/strict";
import test from "node:test";
import {
  BuilderGraphSourceService,
  BuilderSourceCredentialRequiredError,
  BuilderSourceInputError,
  type BuilderGraphClient,
} from "../src/modules/graph/builder-source-service.js";

const credentialId = "10000000-0000-4000-8000-000000000001";
const activeCredential = {
  id: credentialId,
  label: "primary",
  provider: "the_graph" as const,
  credentialType: "graph_api_key" as const,
  ownershipModel: "customer_supplied" as const,
  billingModel: "customer_subscription" as const,
  publicPrefix: "test...",
  fingerprint: "fingerprint",
  secretVersion: "1",
  status: "active" as const,
  isSelected: true,
  validatedAt: "2026-09-11T00:00:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  observedConstraints: null,
  createdAt: "2026-09-11T00:00:00.000Z",
  updatedAt: "2026-09-11T00:00:00.000Z",
  lockVersion: 1,
};

const sdl = `
  scalar BigInt
  scalar BigDecimal
  type Swap @entity {
    id: ID!
    timestamp: BigInt!
    amountUSD: BigDecimal!
  }
  type Query { swaps(first: Int): [Swap!]! }
`;

function credentials(selected = true) {
  return {
    async list() { return selected ? [activeCredential] : []; },
    async resolve() { return selected ? "server-only-key" : null; },
  };
}

function graph(overrides: Partial<BuilderGraphClient> = {}) {
  const calls: string[] = [];
  let closed = false;
  const client: BuilderGraphClient = {
    async searchSubgraphsByKeyword(keyword) {
      calls.push(`search:${keyword}`);
      return {
        subgraphs: keyword.includes("arbitrum") ? [{
          subgraphId: "logical-arbitrum",
          displayName: "Uniswap Arbitrum One",
          manifestIpfsCid: "QmArbitrum",
        }] : [{
          subgraphId: "logical-ethereum",
          displayName: "Uniswap Ethereum",
          manifestIpfsCid: "QmEthereum",
        }],
        total: 1,
        returned: 1,
      };
    },
    async getDeploymentActivity(ids) {
      calls.push(`activity:${ids.join(",")}`);
      return ids.map((id) => ({
        manifestIpfsCid: id,
        totalQueryCount30d: id === "QmArbitrum" ? 50 : 100,
        dataPointsCount: 30,
      }));
    },
    async getSchema(reference) {
      calls.push(`schema:${reference.type}:${reference.id}`);
      return sdl;
    },
    async getTopDeploymentsForContract(request) {
      calls.push(`contract:${request.chain}`);
      return [{manifestIpfsCid: "QmContract", network: request.chain, queryFeesAmount: null}];
    },
    async getRuntimeQueryFields() { return []; },
    async close() { closed = true; },
    ...overrides,
  };
  return {client, calls, wasClosed: () => closed};
}

test("Builder Graph search uses the selected server-side credential and ranks network evidence", async () => {
  const fake = graph();
  let receivedKey = "";
  const service = new BuilderGraphSourceService(credentials(), (apiKey) => {
    receivedKey = apiKey;
    return fake.client;
  });

  const result = await service.search({workspaceId: "workspace", query: "Uniswap", network: "arbitrum-one"});

  assert.equal(receivedKey, "server-only-key");
  assert.deepEqual(fake.calls, [
    "search:Uniswap",
    "search:Uniswap arbitrum-one",
    "activity:QmEthereum,QmArbitrum",
  ]);
  assert.equal(result.candidates[0]?.manifestIpfsCid, "QmArbitrum");
  assert.equal(result.candidates[0]?.networkEvidence, "matched");
  assert.equal(result.network?.dataNetwork, "eip155:42161");
  assert.equal(fake.wasClosed(), true);
});

test("Builder Graph contract search requires a known network and stays bounded", async () => {
  const fake = graph();
  const service = new BuilderGraphSourceService(credentials(), () => fake.client);
  await assert.rejects(
    () => service.search({workspaceId: "workspace", query: "0x1111111111111111111111111111111111111111"}),
    BuilderSourceInputError,
  );
  const result = await service.search({
    workspaceId: "workspace",
    query: "0x1111111111111111111111111111111111111111",
    network: "base",
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.manifestIpfsCid, "QmContract");
  assert.match(fake.calls.join(" "), /contract:base/);
});

test("Builder Graph validation returns exact inspected query entities and provider field paths", async () => {
  const fake = graph();
  const service = new BuilderGraphSourceService(credentials(), () => fake.client);

  const result = await service.validate({
    workspaceId: "workspace",
    reference: {type: "ipfs_hash", id: "QmArbitrum"},
    network: "arbitrum-one",
  });

  assert.equal(result.admissionStatus, "planning_verified");
  assert.equal(result.access.credentialId, credentialId);
  assert.equal(result.entities[0]?.queryEntity, "swaps");
  assert.deepEqual(result.entities[0]?.fields.map((field) => field.path), ["amountUSD", "id", "timestamp"]);
  assert.equal(result.activity?.totalQueryCount30d, 50);
  assert.equal(result.dataNetwork, "eip155:42161");
  assert.match(result.schemaHash, /^sha256:[a-f0-9]{64}$/);
});

test("Builder Graph operations fail before provider access without a selected active credential", async () => {
  const service = new BuilderGraphSourceService(credentials(false), () => graph().client);
  await assert.rejects(
    () => service.search({workspaceId: "workspace", query: "Uniswap"}),
    BuilderSourceCredentialRequiredError,
  );
});
