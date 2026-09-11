import assert from "node:assert/strict";
import test from "node:test";
import {hederaTransactionUrl} from "../src/features/delivery/hederaExplorer.js";

test("builds fixed Hedera testnet HashScan links from persisted transaction IDs", () => {
  assert.equal(
    hederaTransactionUrl({networkTransactionId: "0.0.7162784-1789163795-582525505"}),
    "https://hashscan.io/testnet/transaction/0.0.7162784@1789163795.582525505",
  );
  assert.equal(
    hederaTransactionUrl({networkTransactionId: null, providerTransactionRef: "0.0.7162784@1789092000.1"}),
    "https://hashscan.io/testnet/transaction/0.0.7162784@1789092000.1",
  );
});

test("does not create explorer links from correlation IDs or unsafe values", () => {
  assert.equal(hederaTransactionUrl({networkTransactionId: null, providerTransactionRef: null}), null);
  assert.equal(hederaTransactionUrl({networkTransactionId: "https://example.com"}), null);
  assert.equal(hederaTransactionUrl({networkTransactionId: "628bdcbd-7666-4b3d-be2c-0b78017f0c27"}), null);
});
