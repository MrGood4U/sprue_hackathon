import assert from "node:assert/strict";
import test from "node:test";
import {Blocky402Client, Blocky402Error, type X402PaymentPayload} from "../src/modules/payments/blocky402-client.js";
import type {X402PaymentRequirements} from "../src/modules/deployments/contracts.js";

const requirements: X402PaymentRequirements = {
  scheme: "exact",
  network: "hedera:testnet",
  amount: "20000000",
  payTo: "0.0.8011510",
  maxTimeoutSeconds: 300,
  asset: "0.0.0",
  extra: {feePayer: "0.0.7162784"},
};

const payload: X402PaymentPayload = {
  x402Version: 2,
  scheme: "exact",
  network: "hedera:testnet",
  accepted: requirements,
  payload: {transaction: "base64-partially-signed-transaction"},
};

test("Blocky402 client uses the canonical v2 envelopes and pins Hedera's advertised fee payer", async () => {
  const requests: Array<{url: string; init: RequestInit}> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({url, init: init ?? {}});
    if (url.endsWith("/supported")) return Response.json({
      kinds: [
        {x402Version: 2, scheme: "exact", network: "eip155:80002"},
        {x402Version: 2, scheme: "exact", network: "hedera:testnet", extra: {feePayer: "0.0.7162784"}},
      ],
      extensions: [],
      signers: {"hedera:*": ["0.0.7162784"]},
    });
    if (url.endsWith("/verify")) return Response.json({isValid: true, payer: "0.0.7326075"});
    return Response.json({success: true, transaction: "0.0.7162784@1789092000.1",
      network: "hedera:testnet", payer: "0.0.7326075"});
  };
  const client = new Blocky402Client("https://api.testnet.blocky402.com/", fetchImpl);

  const supported = await client.supported();
  const verified = await client.verify(payload, requirements);
  const settled = await client.settle(payload, requirements);

  assert.equal(supported.feePayer, requirements.extra.feePayer);
  assert.equal(verified.valid, true);
  assert.equal(settled.success, true);
  assert.deepEqual(requests.map((request) => request.url), [
    "https://api.testnet.blocky402.com/supported",
    "https://api.testnet.blocky402.com/verify",
    "https://api.testnet.blocky402.com/settle",
  ]);
  for (const request of requests.slice(1)) {
    const body = JSON.parse(String(request.init.body));
    assert.deepEqual(body, {x402Version: 2, paymentPayload: payload, paymentRequirements: requirements});
  }
});

test("Blocky402 settlement fails closed when the facilitator confirms a different network", async () => {
  const client = new Blocky402Client("https://api.testnet.blocky402.com", async () => Response.json({
    success: true,
    transaction: "unexpected-transaction",
    network: "eip155:80002",
    payer: "0.0.7326075",
  }));
  const settled = await client.settle(payload, requirements);
  assert.equal(settled.success, false);
});

test("Blocky402 client classifies transport failures without retaining provider details", async () => {
  const client = new Blocky402Client("https://api.testnet.blocky402.com", async () => {
    throw new Error("private upstream failure");
  });
  await assert.rejects(client.supported(), (error: unknown) =>
    error instanceof Blocky402Error && error.code === "BLOCKY402_UNAVAILABLE"
      && !error.message.includes("private upstream failure"));
});
