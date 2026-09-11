export const CLI_NAME = "hx402-cli";

const OVERVIEW = `Hedera x402 CLI

Use ${CLI_NAME} to create or import a Hedera wallet, inspect an x402 payment
request, pay it within a local HBAR limit, and print the protected API response.

Quick start (testnet):
  1. ${CLI_NAME} wallet create --network testnet --max-hbar 1
  2. Fund the displayed EVM address with the Hedera Portal faucet.
  3. ${CLI_NAME} wallet resolve
  4. ${CLI_NAME} request <URL> --dry-run --max-hbar 0.25
  5. ${CLI_NAME} request <URL> --max-hbar 0.25

Usage:
  ${CLI_NAME}                         Start the interactive command line
  ${CLI_NAME} help [TOPIC]            Show this guide or topic-specific help
  ${CLI_NAME} wallet ...              Create, import, inspect, or resolve a wallet
  ${CLI_NAME} faucet ...              Fund a testnet wallet with a Portal PAT
  ${CLI_NAME} request ...             Inspect or call an x402 HTTP endpoint
  ${CLI_NAME} config ...              Change the local payment ceiling

Help topics:
  wallet, faucet, request, config

Interactive controls:
  help [TOPIC]    Show help
  clear           Clear the terminal
  exit            Close the interactive command line

Run "${CLI_NAME} help <TOPIC>" for options and examples.
`;

const WALLET = `Hedera x402 CLI - wallet

Create a new encrypted ECDSA wallet:
  ${CLI_NAME} wallet create [--network testnet|mainnet] [--max-hbar 1] [--force]

Import an existing ECDSA account. Supply the private key through the hidden
prompt or the temporary HX402_PRIVATE_KEY environment variable:
  ${CLI_NAME} wallet import --account-id 0.0.1234
                           [--network testnet|mainnet] [--max-hbar 1] [--force]

Inspect and refresh wallet state:
  ${CLI_NAME} wallet show
  ${CLI_NAME} wallet resolve [--timeout-ms 10000]
  ${CLI_NAME} wallet balance [--timeout-ms 10000]

New wallets expose an EVM address first. Fund that address, then run
"wallet resolve" so the CLI can discover its Hedera account ID.
`;

const FAUCET = `Hedera x402 CLI - faucet

Request HBAR for the configured testnet wallet:
  ${CLI_NAME} faucet [--amount 10] [--timeout-ms 15000]

Set HEDERA_PORTAL_PAT before running this command. The token is sent only to
Hedera Portal and is not stored. This command refuses mainnet wallets.
`;

const REQUEST = `Hedera x402 CLI - request

Usage:
  ${CLI_NAME} request <URL> [-X METHOD] [-H "Name: value"] [-d JSON|@file]
                 [-o file] [--max-hbar HBAR] [--timeout-ms 30000]
                 [--dry-run] [--yes] [--include]

Examples:
  ${CLI_NAME} request "https://api.example/x402" --dry-run --max-hbar 0.25
  ${CLI_NAME} request "https://api.example/x402" --max-hbar 0.25
  ${CLI_NAME} request "https://api.example/x402" --yes --max-hbar 0.25
  ${CLI_NAME} request "https://api.example/x402" -X POST -d @request.json

Options:
  -X, --method       HTTP method; defaults to GET or POST when data is supplied
  -H, --header       Add a request header; may be repeated
  -d, --data         Inline body or @file path
  -o, --output       Write the response body to a file
  --max-hbar         Maximum HBAR authorized for this request
  --timeout-ms       HTTP timeout in milliseconds
  --dry-run          Inspect the payment challenge without signing or paying
  --yes              Approve payment without the interactive confirmation
  --include          Include response status and headers on standard output

The CLI validates and pins the payment requirement before signing. Response
bodies use standard output; diagnostics and payment metadata use standard error.
`;

const CONFIG = `Hedera x402 CLI - config

Change the default maximum payment allowed for one request:
  ${CLI_NAME} config max-payment <HBAR>

Example:
  ${CLI_NAME} config max-payment 0.25

An explicit --max-hbar on "request" overrides this stored value for that call.
`;

const ENVIRONMENT = `Environment:
  HX402_HOME                 Wallet directory (default: ~/.hedera-x402)
  HX402_KEYSTORE_PASSWORD    Non-interactive wallet encryption password
  HX402_PRIVATE_KEY          Private key used only by wallet import
  HEDERA_PORTAL_PAT          Hedera Portal PAT used only by faucet
`;

const TOPICS: Readonly<Record<string, string>> = {
  wallet: WALLET,
  faucet: FAUCET,
  request: REQUEST,
  config: CONFIG,
};

export function helpText(topic?: string): string {
  if (!topic) return `${OVERVIEW}\n${ENVIRONMENT}`;
  const normalized = topic.toLowerCase();
  const content = TOPICS[normalized];
  if (!content) {
    throw new Error(`Unknown help topic: ${topic}. Available topics: wallet, faucet, request, config.`);
  }
  return `${content}\n${ENVIRONMENT}`;
}
