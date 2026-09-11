# Hedera x402 CLI

`hx402` is a standalone consumer for x402 v2 APIs that charge native HBAR on Hedera. It keeps a buyer key outside Sprue, checks every payment requirement against a local limit, signs a partially signed Hedera transfer, retries the HTTP request, and prints the protected response.

The first release supports the `exact` scheme, `hedera:testnet` or `hedera:mainnet`, and native HBAR (`0.0.0`). It can call any compatible endpoint; it is not tied to a Sprue URL or response schema.

## Install

Node.js 20 or newer is required.

```bash
cd x402-cli
npm ci
npm run build
npm link
hx402 --help
```

For a repository-local invocation without linking:

```bash
node dist/src/cli.js --help
```

## Create and fund a testnet wallet

Create an encrypted local ECDSA key and its Hedera EVM alias:

```bash
hx402 wallet create --network testnet --max-hbar 1
```

This creates key material, not a funded ledger account. Copy the displayed EVM address into the [Hedera testnet faucet](https://portal.hedera.com/faucet), then resolve the resulting account:

```bash
hx402 wallet resolve
hx402 wallet balance
```

The official Portal API can also be used when a personal access token is available:

```bash
export HEDERA_PORTAL_PAT="your-portal-token"
hx402 faucet --amount 10
```

The faucet is development-only and is limited by Hedera Portal policy. `HEDERA_PORTAL_PAT` is sent only to Hedera Portal and is not stored.

## Import an existing buyer account

Only ECDSA keys are supported because the Hedera x402 signer uses the key's EVM-compatible address.

```bash
export HX402_PRIVATE_KEY="your-private-key"
hx402 wallet import --account-id 0.0.1234 --network testnet --max-hbar 1
unset HX402_PRIVATE_KEY
```

The private key is encrypted with AES-256-GCM and a scrypt-derived key. Public metadata and encrypted key material default to `~/.hedera-x402`. Set `HX402_HOME` to choose another directory. For unattended use, supply `HX402_KEYSTORE_PASSWORD`; otherwise the CLI prompts without echoing the passphrase.

Back up the wallet directory before using `--force`. Losing the key or passphrase loses access to the buyer account.

## Inspect and call an x402 API

Inspect a quote without signing or submitting a transaction:

```bash
hx402 request "https://api.example/x402/v1/owner/product?limit=100" --dry-run --max-hbar 0.25
```

Pay after an interactive confirmation and print the API response:

```bash
hx402 request "https://api.example/x402/v1/owner/product?limit=100" --max-hbar 0.25
```

For explicit non-interactive approval:

```bash
hx402 request "https://api.example/paid" --yes --max-hbar 0.25
```

Arbitrary methods, headers, request bodies, and output files are supported:

```bash
hx402 request "https://api.example/paid" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"value"}' \
  -o response.json \
  --max-hbar 0.25
```

Use `-d @request.json` to read a body from a file and `--include` to print response headers. Response bodies go to standard output, while payment and HTTP status metadata go to standard error, so JSON can be piped safely.

## Safety model

- The configured `maxPaymentHbar` is the default per-request ceiling. Override it downward or upward explicitly with `--max-hbar`, or change it with `hx402 config max-payment <HBAR>`.
- The CLI accepts only x402 v2 `exact` native-HBAR requirements for the wallet's configured Hedera network.
- It rejects missing or invalid recipients and fee payers.
- It pins the approved amount, recipient, asset, network, scheme, timeout, and facilitator fee payer. A changed challenge is not signed.
- It never sends a private key to the API or facilitator. The signed x402 payload contains a partially signed Hedera transaction.
- `--yes` authorizes a real payment. Do not use it in untrusted automation without strict URL and amount controls.
- Mainnet spends real HBAR. Test on `hedera:testnet` first.

## Development

```bash
npm run typecheck
npm test
npm run build
```

The CLI deliberately has its own package, dependencies, build output, and wallet state. Sprue is only one possible x402 resource server. The official x402 packages are pinned as one tested set. Security-patched compatible transitive SDK, protobuf, and WebSocket versions are locked through package overrides; update and audit the complete set together, then rerun the protocol-shape tests before using a new release with funds.
