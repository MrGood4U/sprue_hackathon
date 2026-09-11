import assert from "node:assert/strict";
import test from "node:test";
import {runInteractiveShell, tokenizeCommandLine, type InteractiveShellIo} from "../src/shell.js";

test("tokenizes quoted values, JSON, and Windows paths", () => {
  assert.deepEqual(
    tokenizeCommandLine('request "https://example.test/x402?limit=10" -H "X-Name: hello world" -d \'{"ok":true}\' -o C:\\Temp\\out.json'),
    [
      "request",
      "https://example.test/x402?limit=10",
      "-H",
      "X-Name: hello world",
      "-d",
      '{"ok":true}',
      "-o",
      "C:\\Temp\\out.json",
    ],
  );
});

test("preserves empty quoted values and rejects unfinished quotes", () => {
  assert.deepEqual(tokenizeCommandLine('request https://example.test -d ""'), ["request", "https://example.test", "-d", ""]);
  assert.throws(() => tokenizeCommandLine('request "https://example.test'), /Unterminated double quote/);
});

test("interactive shell executes commands and accepts executable prefix", async () => {
  const lines = ["wallet show", "hx402-cli.exe help", "hx402.exe help request", "exit"];
  const commands: string[][] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const io: InteractiveShellIo = {
    readLine: async () => lines.shift()!,
    writeOutput: (value) => output.push(value),
    writeError: (value) => errors.push(value),
    clear: () => undefined,
  };

  await runInteractiveShell(async (arguments_) => {
    commands.push(arguments_);
    return 0;
  }, io);

  assert.deepEqual(commands, [["wallet", "show"], ["help"], ["help", "request"]]);
  assert.match(output.join(""), /Hedera x402 interactive client/);
  assert.deepEqual(errors, []);
});

test("interactive shell reports a command error and continues", async () => {
  const lines = ['request "unfinished', "help", "quit"];
  const commands: string[][] = [];
  const errors: string[] = [];
  const io: InteractiveShellIo = {
    readLine: async () => lines.shift()!,
    writeOutput: () => undefined,
    writeError: (value) => errors.push(value),
    clear: () => undefined,
  };

  await runInteractiveShell(async (arguments_) => {
    commands.push(arguments_);
    return 0;
  }, io);

  assert.deepEqual(commands, [["help"]]);
  assert.match(errors.join(""), /Unterminated double quote/);
});
