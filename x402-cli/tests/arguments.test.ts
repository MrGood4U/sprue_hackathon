import assert from "node:assert/strict";
import test from "node:test";
import {flag, option, options, parseArguments} from "../src/arguments.js";

test("argument parsing preserves repeated headers and positional values", () => {
  const parsed = parseArguments(["https://example.test/data", "-X", "POST", "-H", "Accept: application/json",
    "--header=X-Trace: one", "--yes"]);
  assert.deepEqual(parsed.positionals, ["https://example.test/data"]);
  assert.equal(option(parsed, "method"), "POST");
  assert.deepEqual(options(parsed, "header"), ["Accept: application/json", "X-Trace: one"]);
  assert.equal(flag(parsed, "yes"), true);
});

test("argument parsing rejects missing values and unknown short options", () => {
  assert.throws(() => parseArguments(["-X"]), /requires a value/);
  assert.throws(() => parseArguments(["-z"]), /Unknown option/);
});
