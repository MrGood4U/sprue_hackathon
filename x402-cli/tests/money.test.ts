import assert from "node:assert/strict";
import test from "node:test";
import {hbarToTinybars, tinybarsToHbar} from "../src/money.js";

test("HBAR conversion remains exact at eight decimal places", () => {
  assert.equal(hbarToTinybars("1.00000001"), 100_000_001n);
  assert.equal(hbarToTinybars("0.2"), 20_000_000n);
  assert.equal(tinybarsToHbar(100_000_001n), "1.00000001");
  assert.equal(tinybarsToHbar("20000000"), "0.2");
});

test("HBAR conversion rejects fractional precision loss", () => {
  assert.throws(() => hbarToTinybars("0.000000001"), /at most 8/);
  assert.throws(() => hbarToTinybars("-1"), /non-negative/);
});
