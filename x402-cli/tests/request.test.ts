import assert from "node:assert/strict";
import test from "node:test";
import {decodePaymentSignatureHeader, encodePaymentRequiredHeader} from "@x402/core/http";
import type {PaymentRequired, PaymentRequirements} from "@x402/core/types";
import {PrivateKey} from "@x402/hedera";
import {createPaidFetch, inspectPaymentChallenge} from "../src/request.js";

const requirement: PaymentRequirements = {
  scheme: "exact",
  network: "hedera:testnet",
  amount: "20000000",
  payTo: "0.0.8011510",
  maxTimeoutSeconds: 300,
  asset: "0.0.0",
  extra: {feePayer: "0.0.7162784"},
};

const declaration: PaymentRequired = {
  x402Version: 2,
  resource: {url: "https://api.example.test/x402/v1/owner/product", description: "Example", mimeType: "application/json"},
  accepts: [requirement],
  extensions: {},
};

test("challenge inspection chooses bounded native HBAR requirements", async () => {
  const response = new Response(JSON.stringify(declaration), {
    status: 402,
    headers: {"PAYMENT-REQUIRED": encodePaymentRequiredHeader(declaration)},
  });
  const challenge = await inspectPaymentChallenge(response, "hedera:testnet", 100_000_000n);
  assert.equal(challenge.amountTinybar, 20_000_000n);
  assert.equal(challenge.requirement.payTo, "0.0.8011510");

  await assert.rejects(
    inspectPaymentChallenge(response, "hedera:testnet", 19_999_999n),
    /fits the configured per-request limit/,
  );
});

test("paid fetch emits the standard x402 v2 payload shape", async () => {
  const calls: Request[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(new Request(input, init));
    if (calls.length === 1) {
      return new Response(JSON.stringify(declaration), {
        status: 402,
        headers: {"PAYMENT-REQUIRED": encodePaymentRequiredHeader(declaration)},
      });
    }
    return Response.json({ok: true});
  };
  const paidFetch = createPaidFetch({
    accountId: "0.0.7326075",
    privateKey: PrivateKey.generateECDSA(),
    network: "hedera:testnet",
    approvedRequirement: requirement,
    fetchImpl,
  });
  const response = await paidFetch(declaration.resource.url);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const paymentHeader = calls[1]!.headers.get("PAYMENT-SIGNATURE");
  assert.ok(paymentHeader);
  const payload = decodePaymentSignatureHeader(paymentHeader);
  assert.equal(payload.x402Version, 2);
  assert.deepEqual(payload.accepted, requirement);
  assert.equal(typeof payload.payload.transaction, "string");
  assert.equal("scheme" in payload, false);
  assert.equal("network" in payload, false);
});

test("paid fetch refuses a changed payment requirement", async () => {
  const changed = {...declaration, accepts: [{...requirement, payTo: "0.0.8011511"}]};
  const paidFetch = createPaidFetch({
    accountId: "0.0.7326075",
    privateKey: PrivateKey.generateECDSA(),
    network: "hedera:testnet",
    approvedRequirement: requirement,
    fetchImpl: async () => new Response(JSON.stringify(changed), {
      status: 402,
      headers: {"PAYMENT-REQUIRED": encodePaymentRequiredHeader(changed)},
    }),
  });
  await assert.rejects(paidFetch(declaration.resource.url), /payment requirement changed|filtered out by policies|rejected by spendControls/iu);
});
