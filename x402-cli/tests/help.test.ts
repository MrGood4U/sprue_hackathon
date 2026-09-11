import assert from "node:assert/strict";
import test from "node:test";
import {CLI_NAME, helpText} from "../src/help.js";

test("overview help guides a new user through the testnet flow", () => {
  const help = helpText();

  assert.equal(CLI_NAME, "hx402-cli");
  assert.match(help, /Quick start \(testnet\)/);
  assert.match(help, /hx402-cli wallet create/);
  assert.match(help, /hx402-cli request <URL> --dry-run/);
  assert.match(help, /help \[TOPIC\]/);
});

test("topic help documents request safety and examples", () => {
  const help = helpText("request");

  assert.match(help, /--max-hbar/);
  assert.match(help, /--dry-run/);
  assert.match(help, /--yes/);
  assert.match(help, /standard output/);
});

test("unknown help topics report the available choices", () => {
  assert.throws(() => helpText("missing"), /Available topics: wallet, faucet, request, config/);
});
