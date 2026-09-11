import assert from "node:assert/strict";
import test from "node:test";
import {PrivateKey} from "@x402/hedera";
import {parseEcdsaPrivateKey, readHederaAccount, requestTestnetFaucet} from "../src/hedera.js";

test("ECDSA key parsing accepts the SDK secp256k1 type and rejects ED25519", () => {
  const ecdsa = PrivateKey.generateECDSA();
  assert.equal(parseEcdsaPrivateKey(ecdsa.toStringRaw()).publicKey.toStringRaw(), ecdsa.publicKey.toStringRaw());

  const ed25519 = PrivateKey.generateED25519();
  assert.throws(() => parseEcdsaPrivateKey(ed25519.toStringDer()), /Only ECDSA Hedera keys are supported/);
});

test("Mirror Node resolution validates and returns canonical account data", async () => {
  const observation = await readHederaAccount("0x1111111111111111111111111111111111111111", "hedera:testnet", {
    fetchImpl: async (input, init) => {
      assert.match(String(input), /testnet\.mirrornode\.hedera\.com\/api\/v1\/accounts\/0x1111/);
      assert.equal(new Headers(init?.headers).get("accept"), "application/json");
      return Response.json({
        account: "0.0.1234",
        evm_address: "0x1111111111111111111111111111111111111111",
        balance: {balance: 1_250_000_000},
        deleted: false,
      });
    },
  });
  assert.deepEqual(observation, {
    accountId: "0.0.1234",
    evmAddress: "0x1111111111111111111111111111111111111111",
    balanceTinybar: "1250000000",
    deleted: false,
  });
});

test("testnet faucet sends the caller PAT only to the fixed Portal endpoint", async () => {
  const requests: Request[] = [];
  const transactionId = await requestTestnetFaucet({
    evmAddress: "0x2222222222222222222222222222222222222222",
    amountHbar: 10,
    portalPat: "test-portal-token",
    fetchImpl: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({amount: 10, transactionId: "0.0.2@1789092000.123456789"});
    },
  });
  assert.equal(requests.length, 1);
  const request = requests[0]!;
  assert.equal(request.url, "https://portal.hedera.com/api/disbursement/cli");
  assert.equal(request.headers.get("authorization"), "Bearer test-portal-token");
  assert.deepEqual(await request.json(), {
    address: "0x2222222222222222222222222222222222222222",
    amount: 10,
    network: "testnet",
  });
  assert.equal(transactionId, "0.0.2@1789092000.123456789");
});
