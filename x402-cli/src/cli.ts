#!/usr/bin/env node
import {readFile, writeFile} from "node:fs/promises";
import {stderr, stdout} from "node:process";
import {PrivateKey} from "@x402/hedera";
import {flag, option, options, parseArguments, type ParsedArguments} from "./arguments.js";
import {
  cliHome,
  loadWalletConfig,
  saveWallet,
  saveWalletConfig,
  unlockWallet,
  walletExists,
  type HederaNetwork,
  type WalletConfig,
} from "./config.js";
import {
  parseAccountId,
  parseEcdsaPrivateKey,
  parseNetwork,
  publicWalletFromPrivateKey,
  readHederaAccount,
  requestTestnetFaucet,
} from "./hedera.js";
import {CLI_NAME, helpText} from "./help.js";
import {confirm, promptSecret} from "./io.js";
import {hbarToTinybars, tinybarsToHbar} from "./money.js";
import {createPaidFetch, inspectPaymentChallenge, readPaymentResponse} from "./request.js";
import {runInteractiveShell} from "./shell.js";

function fail(message: string): never {
  throw new Error(message);
}

function requireOnly(args: ParsedArguments, allowed: readonly string[]): void {
  const allow = new Set(allowed);
  for (const name of args.options.keys()) {
    if (!allow.has(name)) fail(`Option --${name} is not valid for this command.`);
  }
}

function positiveInteger(value: string | undefined, fallback: number, label: string, maximum = 300_000): number {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) fail(`${label} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) fail(`${label} must not exceed ${maximum}.`);
  return parsed;
}

function paymentLimit(args: ParsedArguments, config?: WalletConfig): bigint {
  const explicit = option(args, "max-hbar");
  const amount = explicit === undefined ? BigInt(config?.maxPaymentTinybar ?? hbarToTinybars("1")) : hbarToTinybars(explicit);
  if (amount <= 0n) fail("The per-request payment limit must be greater than zero HBAR.");
  return amount;
}

async function walletPassphrase(confirmNew = false): Promise<string> {
  const fromEnvironment = process.env.HX402_KEYSTORE_PASSWORD;
  if (fromEnvironment !== undefined) {
    if (fromEnvironment.length < 8) fail("HX402_KEYSTORE_PASSWORD must contain at least 8 characters.");
    return fromEnvironment;
  }
  const value = await promptSecret(confirmNew ? "Create wallet passphrase: " : "Wallet passphrase: ");
  if (value.length < 8) fail("The wallet passphrase must contain at least 8 characters.");
  if (confirmNew) {
    const repeated = await promptSecret("Confirm wallet passphrase: ");
    if (value !== repeated) fail("The wallet passphrases did not match.");
  }
  return value;
}

async function privateKeyForImport(): Promise<string> {
  const fromEnvironment = process.env.HX402_PRIVATE_KEY;
  return fromEnvironment?.trim() || await promptSecret("Hedera ECDSA private key: ");
}

function publicConfig(config: WalletConfig) {
  return {
    network: config.network,
    accountId: config.accountId,
    evmAddress: config.evmAddress,
    publicKey: config.publicKey,
    maxPaymentHbar: tinybarsToHbar(config.maxPaymentTinybar),
    walletDirectory: cliHome(),
  };
}

async function createWallet(args: ParsedArguments, imported: boolean): Promise<void> {
  requireOnly(args, ["account-id", "network", "max-hbar", "force"]);
  if (args.positionals.length !== 0) fail(`wallet ${imported ? "import" : "create"} does not accept positional arguments.`);
  const network = parseNetwork(option(args, "network"));
  const limit = paymentLimit(args);
  const accountIdOption = option(args, "account-id");
  if (imported && !accountIdOption) fail("wallet import requires --account-id.");
  if (!imported && accountIdOption) fail("wallet create does not accept --account-id.");
  const accountId = imported ? parseAccountId(accountIdOption!) : null;
  const privateKey = imported ? parseEcdsaPrivateKey(await privateKeyForImport()) : PrivateKey.generateECDSA();
  const config = publicWalletFromPrivateKey(privateKey, network, accountId, limit.toString());
  const passphrase = await walletPassphrase(true);
  const home = cliHome();
  await saveWallet(home, config, privateKey.toStringRaw(), passphrase, flag(args, "force"));
  stdout.write(`${JSON.stringify(publicConfig(config), null, 2)}\n`);
  if (!imported) stderr.write(`Wallet identity created. Fund the displayed EVM address to create its Hedera account, then run \`${CLI_NAME} wallet resolve\`.\n`);
}

async function observeWallet(args: ParsedArguments, resolveOnly: boolean): Promise<void> {
  requireOnly(args, ["timeout-ms"]);
  if (args.positionals.length !== 0) fail(`wallet ${resolveOnly ? "resolve" : "balance"} does not accept positional arguments.`);
  const home = cliHome();
  const config = await loadWalletConfig(home);
  const timeoutMs = positiveInteger(option(args, "timeout-ms"), 10_000, "Request timeout");
  const observation = await readHederaAccount(config.accountId ?? config.evmAddress, config.network, {timeoutMs});
  if (!observation || observation.deleted) fail("The wallet does not resolve to an active Hedera account on the configured network.");
  if (config.accountId && observation.accountId !== config.accountId) fail("The configured account ID does not match the wallet EVM address.");
  if (observation.evmAddress && observation.evmAddress !== config.evmAddress) fail("The resolved Hedera account does not match this wallet key.");
  if (config.accountId !== observation.accountId) {
    await saveWalletConfig(home, {...config, accountId: observation.accountId, updatedAt: new Date().toISOString()});
  }
  stdout.write(`${JSON.stringify({
    network: config.network,
    accountId: observation.accountId,
    evmAddress: observation.evmAddress ?? config.evmAddress,
    balanceTinybar: observation.balanceTinybar,
    balanceHbar: tinybarsToHbar(observation.balanceTinybar),
  }, null, 2)}\n`);
}

async function faucet(args: ParsedArguments): Promise<void> {
  requireOnly(args, ["amount", "timeout-ms"]);
  if (args.positionals.length !== 0) fail("faucet does not accept positional arguments.");
  const home = cliHome();
  const config = await loadWalletConfig(home);
  if (config.network !== "hedera:testnet") fail("The faucet is available only for a testnet wallet.");
  const amount = positiveInteger(option(args, "amount"), 10, "Faucet amount", 100);
  const timeoutMs = positiveInteger(option(args, "timeout-ms"), 15_000, "Request timeout");
  const transactionId = await requestTestnetFaucet({
    evmAddress: config.evmAddress,
    amountHbar: amount,
    portalPat: process.env.HEDERA_PORTAL_PAT ?? "",
    timeoutMs,
  });
  stderr.write(`Faucet transaction submitted: ${transactionId}\n`);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const observation = await readHederaAccount(config.evmAddress, config.network, {timeoutMs}).catch(() => null);
    if (observation && !observation.deleted) {
      await saveWalletConfig(home, {...config, accountId: observation.accountId, updatedAt: new Date().toISOString()});
      stdout.write(`${JSON.stringify({transactionId, accountId: observation.accountId,
        balanceHbar: tinybarsToHbar(observation.balanceTinybar)}, null, 2)}\n`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  stdout.write(`${JSON.stringify({transactionId, accountId: null,
    nextStep: `Run ${CLI_NAME} wallet resolve after Mirror Node indexes the account.`}, null, 2)}\n`);
}

function requestUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail("request requires a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") fail("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) fail("Credentials embedded in URLs are not supported.");
  return url;
}

function requestHeaders(values: readonly string[]): Headers {
  const headers = new Headers();
  for (const value of values) {
    const separator = value.indexOf(":");
    if (separator < 1) fail(`Invalid header: ${value}`);
    const name = value.slice(0, separator).trim();
    const headerValue = value.slice(separator + 1).trim();
    if (["payment-signature", "host", "content-length"].includes(name.toLowerCase())) {
      fail(`Header ${name} is managed by ${CLI_NAME} and cannot be supplied manually.`);
    }
    headers.append(name, headerValue);
  }
  return headers;
}

async function requestBody(value: string | undefined): Promise<string | undefined> {
  if (value === undefined) return undefined;
  return value.startsWith("@") ? readFile(value.slice(1), "utf8") : value;
}

async function emitResponse(response: Response, args: ParsedArguments): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  const output = option(args, "output");
  if (output) {
    await writeFile(output, body, {flag: "w"});
    stderr.write(`Response body written to ${output}.\n`);
  } else {
    if (flag(args, "include")) {
      stdout.write(`HTTP ${response.status} ${response.statusText}\n`);
      for (const [name, value] of response.headers) stdout.write(`${name}: ${value}\n`);
      stdout.write("\n");
    }
    stdout.write(body);
    if (body.length > 0 && body.at(-1) !== 10) stdout.write("\n");
  }
}

async function unlockConfiguredKey(home: string, config: WalletConfig): Promise<ReturnType<typeof parseEcdsaPrivateKey>> {
  const raw = await unlockWallet(home, await walletPassphrase(false));
  const privateKey = parseEcdsaPrivateKey(raw);
  if (privateKey.publicKey.toStringRaw().toLowerCase() !== config.publicKey.toLowerCase()) {
    fail("The private key does not match the configured wallet public key.");
  }
  return privateKey;
}

async function requestCommand(args: ParsedArguments): Promise<number> {
  requireOnly(args, ["method", "header", "data", "output", "max-hbar", "timeout-ms", "dry-run", "yes", "include"]);
  if (args.positionals.length !== 1) fail("request requires exactly one URL.");
  const url = requestUrl(args.positionals[0]!).toString();
  const method = (option(args, "method") ?? (option(args, "data") === undefined ? "GET" : "POST")).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) fail("HTTP method contains invalid characters.");
  const headers = requestHeaders(options(args, "header"));
  const body = await requestBody(option(args, "data"));
  if (body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
  const timeoutMs = positiveInteger(option(args, "timeout-ms"), 30_000, "Request timeout");
  const init = {method, headers, body, redirect: "error" as const, cache: "no-store" as const};
  const first = await fetch(url, {...init, signal: AbortSignal.timeout(timeoutMs)});
  if (first.status !== 402) {
    stderr.write(`No payment required; received HTTP ${first.status}.\n`);
    await emitResponse(first, args);
    return first.ok ? 0 : 1;
  }

  const home = cliHome();
  const hasWallet = await walletExists(home);
  const config = hasWallet ? await loadWalletConfig(home) : undefined;
  const network: HederaNetwork = config?.network ?? "hedera:testnet";
  const challenge = await inspectPaymentChallenge(first, network, paymentLimit(args, config));
  const summary = {
    network: challenge.requirement.network,
    asset: "HBAR",
    amountTinybar: challenge.requirement.amount,
    amountHbar: tinybarsToHbar(challenge.amountTinybar),
    payTo: challenge.requirement.payTo,
    feePayer: challenge.requirement.extra?.feePayer,
    resource: challenge.declaration.resource?.url ?? url,
  };
  stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (flag(args, "dry-run")) {
    stderr.write("Dry run complete; no transaction was signed or submitted.\n");
    return 0;
  }
  if (!config) fail(`No wallet is configured in ${home}. Run \"${CLI_NAME} wallet create\" or \"${CLI_NAME} wallet import\".`);
  if (!config.accountId) fail(`The wallet has not resolved to a Hedera account. Fund it, then run \`${CLI_NAME} wallet resolve\`.`);
  if (!flag(args, "yes") && !await confirm(`Pay ${summary.amountHbar} HBAR to ${summary.payTo}?`)) fail("Payment cancelled.");
  const privateKey = await unlockConfiguredKey(home, config);
  const paidFetch = createPaidFetch({
    accountId: config.accountId,
    privateKey,
    network: config.network,
    approvedRequirement: challenge.requirement,
  });
  const paid = await paidFetch(url, {...init, signal: AbortSignal.timeout(timeoutMs)});
  const settlement = readPaymentResponse(paid);
  if (settlement) stderr.write(`Payment response: ${JSON.stringify(settlement)}\n`);
  stderr.write(`Received HTTP ${paid.status}.\n`);
  await emitResponse(paid, args);
  return paid.ok ? 0 : 1;
}

async function executeArguments(rawArguments: string[]): Promise<number> {
  const [command, subcommand, ...rest] = rawArguments;
  if (!command || command === "--help" || command === "-h") {
    stdout.write(helpText());
    return 0;
  }
  if (command === "help") {
    if (rest.length > 0) fail("help accepts at most one topic.");
    stdout.write(helpText(subcommand));
    return 0;
  }
  if (rawArguments.some((value) => value === "--help" || value === "-h")) {
    stdout.write(helpText(command));
    return 0;
  }
  if (command === "wallet") {
    const args = parseArguments(rest);
    if (subcommand === "create") {
      await createWallet(args, false);
      return 0;
    }
    if (subcommand === "import") {
      await createWallet(args, true);
      return 0;
    }
    if (subcommand === "show") {
      requireOnly(args, []);
      if (args.positionals.length) fail("wallet show does not accept positional arguments.");
      stdout.write(`${JSON.stringify(publicConfig(await loadWalletConfig(cliHome())), null, 2)}\n`);
      return 0;
    }
    if (subcommand === "balance") {
      await observeWallet(args, false);
      return 0;
    }
    if (subcommand === "resolve") {
      await observeWallet(args, true);
      return 0;
    }
    fail("wallet requires create, import, show, balance, or resolve.");
  }
  if (command === "config" && subcommand === "max-payment") {
    const args = parseArguments(rest);
    requireOnly(args, []);
    if (args.positionals.length !== 1) fail("config max-payment requires one HBAR amount.");
    const amount = hbarToTinybars(args.positionals[0]!);
    if (amount <= 0n) fail("The per-request payment limit must be greater than zero HBAR.");
    const home = cliHome();
    const config = await loadWalletConfig(home);
    const updated = {...config, maxPaymentTinybar: amount.toString(), updatedAt: new Date().toISOString()};
    await saveWalletConfig(home, updated);
    stdout.write(`${JSON.stringify(publicConfig(updated), null, 2)}\n`);
    return 0;
  }
  if (command === "faucet") {
    await faucet(parseArguments([subcommand, ...rest].filter((value): value is string => value !== undefined)));
    return 0;
  }
  if (command === "request") {
    return requestCommand(parseArguments([subcommand, ...rest].filter((value): value is string => value !== undefined)));
  }
  fail(`Unknown command: ${command}${subcommand ? ` ${subcommand}` : ""}`);
}

async function run(): Promise<void> {
  const rawArguments = process.argv.slice(2);
  if (rawArguments.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    await runInteractiveShell(executeArguments);
    return;
  }
  process.exitCode = await executeArguments(rawArguments);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected failure.";
  stderr.write(`${CLI_NAME}: ${message}\n`);
  process.exitCode = 1;
});
