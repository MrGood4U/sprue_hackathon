import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { copyText } from "../src/features/wallet/copyText.js";
import { GRAPH_ACCESS_MODE, showsGraphCredentials } from "../src/features/wallet/graphAccessMode.js";

test("Graph credentials are disclosed only for API-key access", () => {
  assert.equal(showsGraphCredentials(GRAPH_ACCESS_MODE.API_KEY), true);
  assert.equal(showsGraphCredentials(GRAPH_ACCESS_MODE.X402), false);
  assert.equal(showsGraphCredentials("unknown"), false);
});

test("wallet text is copied with the Clipboard API", async () => {
  let copied;
  await copyText("0x1234", {
    clipboard: { writeText: async (value) => { copied = value; } },
    documentImpl: null,
  });
  assert.equal(copied, "0x1234");
});

test("wallet text falls back to a temporary textarea", async () => {
  const textarea = {
    style: {},
    setAttribute() {},
    focus() {},
    select() {},
    remove() { this.removed = true; },
  };
  const documentImpl = {
    body: { appendChild(node) { this.node = node; } },
    createElement(tag) { assert.equal(tag, "textarea"); return textarea; },
    execCommand(command) { assert.equal(command, "copy"); return true; },
  };

  await copyText("0x5678", {
    clipboard: { writeText: async () => { throw new Error("denied"); } },
    documentImpl,
  });
  assert.equal(textarea.value, "0x5678");
  assert.equal(textarea.removed, true);
});

test("Wallet and Access shows complete separated balances and fail-closed transfers", async () => {
  const page = await readFile(new URL("../src/pages/WalletAccessPage.jsx", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../../backend/src/modules/demo/runtime.ts", import.meta.url), "utf8");

  assert.match(page, /<strong>\{wallet\.address\}<\/strong>/);
  assert.match(page, /onClick=\{copyWalletAddress\}/);
  assert.doesNotMatch(page, /wallet\.displayAddress|wallet\.view|ArrowSquareOut/);
  assert.match(page, /wallet\.balances\.map/);
  assert.match(page, /setModal\(\{ type: "transfer", balance \}\)/);
  assert.match(page, /<Button variant="primary" disabled>\{t\("wallet\.transferUnavailable"\)\}<\/Button>/);
  assert.match(runtime, /kind: "graph_spend"[\s\S]*?asset: "USDC"[\s\S]*?network: "Base Sepolia"/);
  assert.match(runtime, /kind: "x402_revenue"[\s\S]*?asset: "HBAR"[\s\S]*?network: "Hedera testnet"/);
  assert.doesNotMatch(runtime, /displayAddress:/);
});
