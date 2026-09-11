import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeFunctionData, erc20Abi } from "viem";
import { copyText } from "../src/features/wallet/copyText.js";
import { GRAPH_ACCESS_MODE, showsGraphCredentials } from "../src/features/wallet/graphAccessMode.js";
import {
  BASE_SEPOLIA_USDC_ADDRESS,
  hasSpendableBalance,
  hederaAccountIdToEvmAddress,
  parseExactAmount,
  prepareWalletTransfer,
  TransferValidationError,
} from "../src/features/wallet/transfer.js";
import {
  createGraphCredential,
  createHederaAccount,
  deleteGraphCredential,
  getWalletAccess,
  selectGraphCredential,
  validateGraphCredential,
} from "../src/services/api/wallet.js";

const workspaceId = "7ff7ec9e-1bc4-48ae-bac1-e7703d021834";
const accessToken = "creator-token";

function liveResponse(data, init) {
  return Response.json({data, meta: {apiVersion: "1", dataSource: "live"}}, init);
}

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

test("Wallet and Access uses live workspace data and delegates direct transfers to the wallet feature", async () => {
  const page = await readFile(new URL("../src/pages/WalletAccessPage.jsx", import.meta.url), "utf8");
  const transferModal = await readFile(new URL("../src/features/wallet/WalletTransferModal.jsx", import.meta.url), "utf8");

  assert.match(page, /getWalletAccess/);
  assert.match(page, /createGraphCredential/);
  assert.match(page, /createHederaAccount/);
  assert.match(page, /aria-busy=\{hederaCreateState === "loading"\}/);
  assert.match(page, /icon=\{hederaCreateState === "loading" \? CircleNotch : undefined\}/);
  assert.match(page, /wallet\.createHederaAccount/);
  assert.doesNotMatch(page, /useSendTransaction|testHederaSigning|hederaSigningTest/);
  assert.match(page, /useAuth/);
  assert.doesNotMatch(page, /useDemoRuntime/);
  assert.match(page, /address\?\.address/);
  assert.match(page, /onClick=\{copyWalletAddress\}/);
  assert.doesNotMatch(page, /wallet\.displayAddress|wallet\.view\b|ArrowSquareOut/);
  assert.match(page, /graphBalance\?\.displayAmount/);
  assert.match(page, /setModal\(\{ type: "transfer", balance: graphBalance \}\)/);
  assert.match(page, /setModal\(\{ type: "transfer", balance: hederaBalance \}\)/);
  assert.match(page, /disabled=\{!address \|\| !graphBalance\}/);
  assert.doesNotMatch(page, /!hasSpendableBalance\(graphBalance\)/);
  assert.match(page, /hederaAddress\.canSpend/);
  assert.match(page, /<WalletTransferModal/);
  assert.doesNotMatch(page, /wallet\.transferUnavailable/);
  assert.match(transferModal, /useSendTransaction/);
  assert.match(transferModal, /showWalletUIs: true/);
  assert.match(transferModal, /isCancellable: true/);
  assert.match(transferModal, /wallet\.transferNoBalance/);
  assert.match(transferModal, /disabled=\{!spendable \|\| submitting/);
  assert.doesNotMatch(transferModal, /setTimeout|retry/);
  assert.match(page, /wallet\.notConnected/);
  assert.doesNotMatch(page, /wallet\.integrationReadiness|walletAccess\?\.readiness/);
  assert.doesNotMatch(page, /18\.42|3\.12|simulateDeposit/);

  const credentialActions = page.indexOf('<div className="credential-actions"');
  const credentialChoice = page.indexOf('<label className="credential-choice">');
  assert.ok(credentialActions >= 0 && credentialChoice > credentialActions, "credential selection belongs in the right-side action group");
});

const baseUsdcBalance = {
  network: "Base Sepolia",
  assetIdentifier: BASE_SEPOLIA_USDC_ADDRESS,
  symbol: "USDC",
  decimals: 6,
  balanceAtomic: "3120000",
  displayAmount: "3.12",
};

const hederaHbarBalance = {
  network: "Hedera Testnet",
  assetIdentifier: "0.0.0",
  symbol: "HBAR",
  decimals: 8,
  balanceAtomic: "97837000",
  displayAmount: "0.97837",
};

test("direct transfer amounts use exact atomic-unit arithmetic", () => {
  assert.equal(parseExactAmount("0.123456", 6), 123456n);
  assert.equal(parseExactAmount("1", 8), 100000000n);
  assert.throws(
    () => parseExactAmount("0.0000001", 6),
    (error) => error instanceof TransferValidationError && error.code === "AMOUNT_PRECISION",
  );
  assert.throws(
    () => parseExactAmount("1e-3", 6),
    (error) => error instanceof TransferValidationError && error.code === "AMOUNT_INVALID",
  );
});

test("a known zero balance remains inspectable but is not spendable", () => {
  assert.equal(hasSpendableBalance({ ...baseUsdcBalance, balanceAtomic: "0" }), false);
  assert.equal(hasSpendableBalance(baseUsdcBalance), true);
});

test("Base Sepolia USDC transfer is fixed to the reviewed contract", () => {
  const destination = "0x1111111111111111111111111111111111111111";
  const prepared = prepareWalletTransfer({
    balance: baseUsdcBalance,
    destination,
    amount: "1.25",
  });
  assert.equal(prepared.transaction.chainId, 84532);
  assert.equal(prepared.transaction.to, BASE_SEPOLIA_USDC_ADDRESS);
  assert.equal(prepared.transaction.value, 0n);
  const decoded = decodeFunctionData({ abi: erc20Abi, data: prepared.transaction.data });
  assert.equal(decoded.functionName, "transfer");
  assert.deepEqual(decoded.args, [destination, 1250000n]);
});

test("Hedera account IDs become long-zero EVM destinations with 18-decimal value", () => {
  const prepared = prepareWalletTransfer({
    balance: hederaHbarBalance,
    destination: "0.0.10410307",
    amount: "0.5",
  });
  assert.equal(prepared.transaction.chainId, 296);
  assert.equal(prepared.transaction.to, hederaAccountIdToEvmAddress("0.0.10410307"));
  assert.equal(prepared.transaction.value, 500000000000000000n);
  assert.equal(prepared.displayAmount, "0.5");
});

test("direct transfers fail closed for invalid destinations, balances, and assets", () => {
  assert.throws(
    () => prepareWalletTransfer({ balance: baseUsdcBalance, destination: "0.0.7", amount: "1" }),
    (error) => error.code === "DESTINATION_INVALID",
  );
  assert.throws(
    () => prepareWalletTransfer({ balance: hederaHbarBalance, destination: "0.0.7", amount: "0.97837" }),
    (error) => error.code === "AMOUNT_REQUIRES_FEE_RESERVE",
  );
  assert.throws(
    () => prepareWalletTransfer({ balance: baseUsdcBalance, destination: "0x1111111111111111111111111111111111111111", amount: "4" }),
    (error) => error.code === "AMOUNT_EXCEEDS_BALANCE",
  );
  assert.throws(
    () => prepareWalletTransfer({
      balance: { ...baseUsdcBalance, assetIdentifier: "0x2222222222222222222222222222222222222222" },
      destination: "0x1111111111111111111111111111111111111111",
      amount: "1",
    }),
    (error) => error.code === "ASSET_UNSUPPORTED",
  );
});

test("Hedera account creation sends an empty account-scoped command", async () => {
  const walletId = "6d060831-077d-4dac-abf1-74869e59561a";
  const walletAccess = {
    wallets: [],
    balances: [],
    credentials: [],
    signerGrants: [],
    spendingPolicies: [],
    recipientCapabilities: [],
    readiness: [],
  };
  const result = await createHederaAccount({walletId}, {
    workspaceId,
    accessToken,
    idempotencyKey: "hedera-command-0001",
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/wallets/${walletId}/resolve-hedera`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Idempotency-Key"], "hedera-command-0001");
      assert.deepEqual(JSON.parse(options.body), {});
      return liveResponse(walletAccess);
    },
  });
  assert.deepEqual(result, walletAccess);
});

test("wallet client reads only live account-scoped data", async () => {
  const walletAccess = {
    wallets: [],
    balances: [],
    credentials: [],
    signerGrants: [],
    spendingPolicies: [],
    recipientCapabilities: [],
    readiness: [],
  };
  const result = await getWalletAccess({
    workspaceId,
    accessToken,
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/wallet-access`);
      assert.equal(options.method, "GET");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.credentials, "omit");
      return liveResponse(walletAccess);
    },
  });
  assert.deepEqual(result, walletAccess);
});

test("Graph credential client sends the secret once and accepts only a redacted view", async () => {
  const credential = {
    id: "6d060831-077d-4dac-abf1-74869e59561a",
    provider: "the_graph",
    credentialType: "graph_api_key",
    label: "production",
    fingerprint: "fingerprint",
    status: "pending_validation",
    isSelected: false,
    lockVersion: 0,
    publicPrefix: "key-...",
  };
  const result = await createGraphCredential({
    label: "production",
    apiKey: "browser-input-only",
  }, {
    workspaceId,
    accessToken,
    idempotencyKey: "credential-command-0001",
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, options) => {
      assert.equal(url, `https://api.example.test/api/v1/workspaces/${workspaceId}/graph-credentials`);
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer creator-token");
      assert.equal(options.headers["Idempotency-Key"], "credential-command-0001");
      assert.deepEqual(JSON.parse(options.body), {
        label: "production",
        apiKey: "browser-input-only",
      });
      return liveResponse(credential, {status: 201});
    },
  });
  assert.deepEqual(result, credential);
  assert.equal(JSON.stringify(result).includes("browser-input-only"), false);
});

test("Graph credential lifecycle actions are scoped and concurrency protected", async () => {
  const credential = {
    id: "6d060831-077d-4dac-abf1-74869e59561a",
    provider: "the_graph",
    credentialType: "graph_api_key",
    label: "production",
    fingerprint: "fingerprint",
    status: "active",
    isSelected: false,
    lockVersion: 3,
  };
  const seen = [];
  const options = {
    workspaceId,
    accessToken,
    idempotencyKey: "credential-lifecycle-0001",
    apiBaseUrl: "https://api.example.test",
    fetchImpl: async (url, request) => {
      seen.push({url, request});
      return liveResponse({...credential, isSelected: url.endsWith("/select")});
    },
  };

  await validateGraphCredential({credentialId: credential.id, lockVersion: 3}, options);
  await selectGraphCredential({credentialId: credential.id, lockVersion: 3}, options);
  await deleteGraphCredential({credentialId: credential.id, lockVersion: 3}, options);

  assert.deepEqual(seen.map(({url}) => url.slice(url.lastIndexOf("/") + 1)), ["validate", "select", "revoke"]);
  for (const {url, request} of seen) {
    assert.equal(url.startsWith(`https://api.example.test/api/v1/workspaces/${workspaceId}/graph-credentials/${credential.id}/`), true);
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, "Bearer creator-token");
    assert.equal(request.headers["If-Match"], '"3"');
    assert.equal(request.headers["Idempotency-Key"], "credential-lifecycle-0001");
    assert.deepEqual(JSON.parse(request.body), {});
  }
});
