import assert from "node:assert/strict";
import test from "node:test";
import {HederaAccountError} from "../src/modules/wallet/contracts.js";
import {hederaAccountProvider} from "../src/modules/wallet/hedera-provider.js";
import type {LogEvent} from "../src/shared/logger.js";

const evmAddress = `0x${"a".repeat(40)}`;
const portalPat = "server-only-hedera-portal-token";

function mirrorAccount(complete = false) {
  return new Response(JSON.stringify({
    account: "0.0.12345",
    balance: {balance: 100_000_000, timestamp: "1757289600.000000000"},
    deleted: false,
    evm_address: evmAddress,
    key: complete ? {_type: "ECDSA_SECP256K1", key: "02feed"} : null,
    receiver_sig_required: false,
  }), {status: 200, headers: {"Content-Type": "application/json"}});
}

function provider(fetchImpl: typeof fetch, logs: LogEvent[] = []) {
  return hederaAccountProvider(
    {
      mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
      faucetUrl: "https://portal.hedera.com/api/disbursement/cli",
      portalPat,
      faucetAmountHbar: 1,
    },
    {
      fetchImpl,
      logger: {write(event) { logs.push(event); }},
      reconciliationDelaysMs: [0, 0],
      sleep: async () => {},
    },
  );
}

test("Hedera activation sends one bounded faucet request and resolves the account through Mirror Node", async () => {
  const requests: Array<{url: string; init: RequestInit}> = [];
  const responses = [
    new Response("{}", {status: 404}),
    new Response(JSON.stringify({transactionId: "0.0.98@1757289600.000000000"}), {status: 200}),
    mirrorAccount(),
  ];
  const logs: LogEvent[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({url: String(url), init: init ?? {}});
    return responses.shift()!;
  }) as typeof fetch;

  const result = await provider(fetchImpl, logs).ensureAccount(evmAddress);
  assert.equal(result.accountId, "0.0.12345");
  assert.equal(result.balanceAtomic, "100000000");
  assert.equal(result.accountCompletionStatus, "hollow");
  assert.equal(result.canSpend, false);
  const posts = requests.filter((request) => request.init.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0]!.url, "https://portal.hedera.com/api/disbursement/cli");
  assert.equal(posts[0]!.init.headers && Object.fromEntries(new Headers(posts[0]!.init.headers).entries()).authorization, `Bearer ${portalPat}`);
  assert.deepEqual(JSON.parse(String(posts[0]!.init.body)), {
    address: evmAddress,
    amount: 1,
    network: "testnet",
  });
  assert.equal(JSON.stringify(logs).includes(portalPat), false);
  assert.equal(JSON.stringify(logs).includes(evmAddress), false);
  assert.ok(logs.some((event) => event.event === "hedera_account_reconciliation" && event.outcome === "created"));
});

test("Hedera activation never posts when the mapped account already exists", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return mirrorAccount(true);
  }) as typeof fetch;
  const result = await provider(fetchImpl).ensureAccount(evmAddress);
  assert.equal(result.accountId, "0.0.12345");
  assert.equal(result.accountCompletionStatus, "complete");
  assert.equal(result.canSpend, true);
  assert.equal(calls, 1);
});

test("an uncertain faucet submission is reconciled without a second transfer", async () => {
  let call = 0;
  let posts = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    call += 1;
    if (init?.method === "POST") {
      posts += 1;
      throw new TypeError("redacted network failure");
    }
    return call === 1 ? new Response("{}", {status: 404}) : mirrorAccount();
  }) as typeof fetch;
  const result = await provider(fetchImpl).ensureAccount(evmAddress);
  assert.equal(result.accountId, "0.0.12345");
  assert.equal(posts, 1);
});

test("Hedera faucet authentication failures are not retried", async () => {
  let posts = 0;
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts += 1;
      return new Response("{}", {status: 403});
    }
    return new Response("{}", {status: 404});
  }) as typeof fetch;
  await assert.rejects(
    provider(fetchImpl).ensureAccount(evmAddress),
    (error: unknown) => error instanceof HederaAccountError && error.reason === "authentication",
  );
  assert.equal(posts, 1);
});
