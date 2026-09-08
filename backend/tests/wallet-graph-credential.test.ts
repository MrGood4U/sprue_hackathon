import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {PGlite} from "@electric-sql/pglite";
import {APIConnectionTimeoutError, APIError} from "@privy-io/node";
import {migrate, readMigrations, type SqlClient} from "../src/db/migrations.js";
import {seedReferenceData} from "../src/db/seed.js";
import {AuthService} from "../src/modules/auth/service.js";
import {postgresAuthRepository} from "../src/modules/auth/postgres-repository.js";
import {GraphCredentialCipher} from "../src/modules/graph-credential/cipher.js";
import {
  GraphCredentialConflictError,
  GraphCredentialNotFoundError,
  GraphCredentialPreconditionError,
  GraphCredentialStorageError,
  GraphCredentialValidationError,
  type GraphCredentialValidator,
  type GraphCredentialService,
} from "../src/modules/graph-credential/index.js";
import {postgresGraphCredentialRepository} from "../src/modules/graph-credential/postgres-repository.js";
import {GraphCredentialService as GraphCredentialDomainService} from "../src/modules/graph-credential/service.js";
import {
  graphCredentialValidationSubgraphId,
  graphCredentialValidator,
} from "../src/modules/graph-credential/validator.js";
import {
  type HederaAccountPort,
  WalletNotFoundError,
  WalletProviderError,
  WalletStorageError,
  type PrivyWalletPort,
} from "../src/modules/wallet/contracts.js";
import {postgresWalletRepository} from "../src/modules/wallet/postgres-repository.js";
import {privyWalletProvider} from "../src/modules/wallet/privy-provider.js";
import {WalletService} from "../src/modules/wallet/service.js";
import type {LogEvent} from "../src/shared/logger.js";

function clientFor(db: PGlite): SqlClient {
  return {
    query: (sql, parameters) => db.query(sql, parameters),
    exec: (sql) => db.exec(sql),
  };
}

async function createOwner(db: PGlite) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  await db.exec("BEGIN");
  try {
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [userId]);
    await db.query(
      "INSERT INTO workspaces(id,owner_user_id,slug,name,status) VALUES ($1,$2,$3,'Test workspace','active')",
      [workspaceId, userId, workspaceId],
    );
    await db.query(
      "INSERT INTO workspace_members(workspace_id,user_id,role,status) VALUES ($1,$2,'owner','active')",
      [workspaceId, userId],
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return {userId, workspaceId};
}

function graphCredentials(
  client: SqlClient,
  validator?: GraphCredentialValidator,
): GraphCredentialService {
  return new GraphCredentialDomainService(
    postgresGraphCredentialRepository(client),
    new GraphCredentialCipher({
      activeKeyId: "test-v1",
      keys: new Map([["test-v1", Buffer.alloc(32, 7)]]),
    }),
    validator,
  );
}

test("Graph API keys are encrypted, redacted, durable, and workspace isolated", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    const ownerA = await createOwner(db);
    const ownerB = await createOwner(db);
    const firstService = graphCredentials(client);
    const secret = "graph-api-key-browser-input-only";
    const saved = await firstService.create(ownerA.workspaceId, ownerA.userId, {
      label: "production",
      apiKey: secret,
    });
    assert.equal(saved.label, "production");
    assert.equal(saved.status, "pending_validation");
    assert.equal(saved.publicPrefix, "grap...");
    assert.equal(JSON.stringify(saved).includes(secret), false);

    const stored = await db.query<{
      api_key_ciphertext: Uint8Array;
      secret_ref: string;
    }>(
      `SELECT pcs.api_key_ciphertext,pc.secret_ref
      FROM provider_credential_secrets pcs
      JOIN provider_credentials pc ON pc.id=pcs.provider_credential_id
      WHERE pc.workspace_id=$1`,
      [ownerA.workspaceId],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]!.secret_ref, `postgres-aesgcm:${saved.id}`);
    assert.equal(
      Buffer.from(stored.rows[0]!.api_key_ciphertext).includes(Buffer.from(secret)),
      false,
    );

    const restartedService = graphCredentials(client);
    assert.equal(await restartedService.resolve(ownerA.workspaceId, saved.id), secret);
    assert.equal(await restartedService.resolve(ownerB.workspaceId, saved.id), null);
    assert.deepEqual(await restartedService.list(ownerB.workspaceId), []);
    assert.equal(
      (await restartedService.create(ownerA.workspaceId, ownerA.userId, {
        label: "production",
        apiKey: secret,
      })).id,
      saved.id,
    );
    await assert.rejects(
      restartedService.create(ownerA.workspaceId, ownerA.userId, {
        label: "production",
        apiKey: "a-different-key",
      }),
      GraphCredentialConflictError,
    );

    await db.query(
      `UPDATE provider_credential_secrets SET encryption_auth_tag=$1
      WHERE provider_credential_id=$2`,
      [Buffer.alloc(16, 0), saved.id],
    );
    await assert.rejects(
      restartedService.resolve(ownerA.workspaceId, saved.id),
      GraphCredentialStorageError,
    );
  } finally {
    await db.close();
  }
});

test("Graph credentials can be validated, selected, and securely revoked per workspace", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    const owner = await createOwner(db);
    const foreign = await createOwner(db);
    const seenKeys: string[] = [];
    const validator: GraphCredentialValidator = {
      async validate(apiKey) {
        seenKeys.push(apiKey);
        return {
          status: "valid",
          observedAt: new Date("2026-09-08T01:00:00.000Z"),
          targetSubgraphId: "validation-subgraph",
          deploymentId: "validation-deployment",
          blockNumber: 123,
          hasIndexingErrors: false,
        };
      },
    };
    const service = graphCredentials(client, validator);
    const first = await service.create(owner.workspaceId, owner.userId, {
      label: "primary",
      apiKey: "first-secret",
    });
    const second = await service.create(owner.workspaceId, owner.userId, {
      label: "backup",
      apiKey: "second-secret",
    });

    const validatedFirst = await service.validate(owner.workspaceId, first.id, 0);
    assert.equal(validatedFirst.status, "active");
    assert.equal(validatedFirst.lockVersion, 1);
    assert.deepEqual(seenKeys, ["first-secret"]);
    const selectedFirst = await service.select(owner.workspaceId, first.id, 1);
    assert.equal(selectedFirst.isSelected, true);

    const validatedSecond = await service.validate(owner.workspaceId, second.id, 0);
    const selectedSecond = await service.select(
      owner.workspaceId,
      second.id,
      validatedSecond.lockVersion,
    );
    assert.equal(selectedSecond.isSelected, true);
    const afterSelection = await service.list(owner.workspaceId);
    assert.equal(afterSelection.find((item) => item.id === first.id)?.isSelected, false);
    assert.equal(afterSelection.find((item) => item.id === second.id)?.isSelected, true);
    await assert.rejects(
      service.select(owner.workspaceId, first.id, selectedFirst.lockVersion),
      GraphCredentialPreconditionError,
    );
    const currentFirst = afterSelection.find((item) => item.id === first.id)!;
    const selectedFirstAgain = await service.select(
      owner.workspaceId,
      first.id,
      currentFirst.lockVersion,
    );
    assert.equal(selectedFirstAgain.isSelected, true);
    const afterReverseSelection = await service.list(owner.workspaceId);
    const currentSecond = afterReverseSelection.find((item) => item.id === second.id)!;
    assert.equal(currentSecond.isSelected, false);
    const selectedSecondAgain = await service.select(
      owner.workspaceId,
      second.id,
      currentSecond.lockVersion,
    );
    assert.equal(selectedSecondAgain.isSelected, true);
    await assert.rejects(
      service.validate(foreign.workspaceId, first.id, 0),
      GraphCredentialNotFoundError,
    );

    const revoked = await service.revoke(
      owner.workspaceId,
      second.id,
      selectedSecondAgain.lockVersion,
    );
    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.isSelected, false);
    assert.equal((await service.list(owner.workspaceId)).some((item) => item.id === second.id), false);
    assert.equal(await service.resolve(owner.workspaceId, second.id), null);
    const secretRows = await db.query<{count: number}>(
      "SELECT count(*)::integer AS count FROM provider_credential_secrets WHERE provider_credential_id=$1",
      [second.id],
    );
    assert.equal(secretRows.rows[0]?.count, 0);
    await assert.rejects(
      service.create(owner.workspaceId, owner.userId, {
        label: "backup",
        apiKey: "second-secret",
      }),
      GraphCredentialConflictError,
    );
  } finally {
    await db.close();
  }
});

test("Graph credential validation uses one fixed bounded bearer query", async () => {
  const apiKey = "graph-validation-secret";
  let calls = 0;
  const validator = graphCredentialValidator(async (url, init) => {
    calls += 1;
    assert.equal(
      url,
      `https://gateway.thegraph.com/api/subgraphs/id/${graphCredentialValidationSubgraphId}`,
    );
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${apiKey}`);
    assert.match(String(init?.body), /SprueCredentialValidation/);
    return Response.json({
      data: {
        _meta: {
          deployment: "QmValidatedDeployment",
          block: {number: 42},
          hasIndexingErrors: false,
        },
      },
    });
  });
  const result = await validator.validate(apiKey);
  assert.equal(calls, 1);
  assert.equal(result.status, "valid");
  assert.equal(result.deploymentId, "QmValidatedDeployment");
  assert.equal(JSON.stringify(result).includes(apiKey), false);

  const rejected = await graphCredentialValidator(async () => new Response(null, {status: 401})).validate(apiKey);
  assert.equal(rejected.status, "rejected");
  await assert.rejects(
    graphCredentialValidator(async () => new Response(null, {status: 429})).validate(apiKey),
    GraphCredentialValidationError,
  );
});

test("authentication provisions one user-owned Privy wallet and reads its live Graph balance", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    await seedReferenceData(client);
    let createCalls = 0;
    let balanceCalls = 0;
    const privyUserId = "did:privy:wallet-owner";
    const provider: PrivyWalletPort = {
      async findOrCreateUserWallet({privyUserId: owner, sprueUserId}) {
        createCalls += 1;
        assert.equal(owner, privyUserId);
        return {
          id: "privy-wallet-1",
          externalId: `sprue_${sprueUserId.replaceAll("-", "")}`,
          address: `0x${"a".repeat(40)}`,
          chainType: "ethereum",
          ownerPrivyUserId: owner,
        };
      },
      async readGraphFundingBalance(walletId) {
        balanceCalls += 1;
        assert.equal(walletId, "privy-wallet-1");
        return {
          chain: "base_sepolia",
          asset: "USDC",
          balanceAtomic: "3120000",
          decimals: 6,
          observedAt: new Date("2026-09-07T00:00:00.000Z"),
        };
      },
    };
    const walletService = new WalletService(
      postgresWalletRepository(client),
      provider,
      graphCredentials(client),
    );
    const auth = new AuthService(
      postgresAuthRepository(async () => ({
        query: (sql, parameters) => db.query(sql, parameters),
        release() {},
      })),
      walletService,
    );

    const first = await auth.bootstrap({provider: "privy", subject: privyUserId});
    const second = await auth.bootstrap({provider: "privy", subject: privyUserId});
    assert.deepEqual(second, first);
    assert.equal(createCalls, 1);

    const walletRows = await db.query<{
      workspace_id: string;
      owner_user_id: string;
      provider_owner_id: string;
      control_model: string;
    }>("SELECT workspace_id,owner_user_id,provider_owner_id,control_model FROM account_wallets");
    assert.deepEqual(walletRows.rows, [{
      workspace_id: first.defaultWorkspaceId,
      owner_user_id: first.user.id,
      provider_owner_id: privyUserId,
      control_model: "user_owned",
    }]);

    const view = await walletService.readAccess(first.defaultWorkspaceId);
    assert.equal(balanceCalls, 1);
    assert.equal(view.wallets[0]?.addresses[0]?.address, `0x${"a".repeat(40)}`);
    assert.deepEqual(view.balances[0], {
      walletAddressId: view.wallets[0]!.addresses[0]!.id,
      networkId: view.wallets[0]!.addresses[0]!.networkId,
      network: "Base Sepolia",
      assetIdentifier: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      symbol: "USDC",
      decimals: 6,
      balanceAtomic: "3120000",
      displayAmount: "3.12",
      observedAt: "2026-09-07T00:00:00.000Z",
      provider: "privy",
      freshness: "current",
    });
    const snapshots = await db.query<{count: number}>(
      "SELECT count(*)::integer AS count FROM wallet_balance_snapshots",
    );
    assert.equal(snapshots.rows[0]!.count, 1);

    const foreign = await createOwner(db);
    const foreignView = await walletService.readAccess(foreign.workspaceId);
    assert.deepEqual(foreignView.wallets, []);
    assert.deepEqual(foreignView.balances, []);
    assert.deepEqual(foreignView.credentials, []);
  } finally {
    await db.close();
  }
});

test("wallet binding stays atomic without reference data and repairs an incomplete binding", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    const owner = await createOwner(db);
    const privyUserId = "did:privy:repair-owner";
    const providerWallet = {
      id: "privy-wallet-repair",
      externalId: `sprue_${owner.userId.replaceAll("-", "")}`,
      address: `0x${"e".repeat(40)}`,
      chainType: "ethereum" as const,
      ownerPrivyUserId: privyUserId,
    };
    let providerCalls = 0;
    const provider: PrivyWalletPort = {
      async findOrCreateUserWallet() {
        providerCalls += 1;
        return providerWallet;
      },
      async readGraphFundingBalance() {
        return null;
      },
    };
    const service = new WalletService(
      postgresWalletRepository(client),
      provider,
      graphCredentials(client),
    );

    await assert.rejects(
      service.ensure({
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        privyUserId,
      }),
      WalletStorageError,
    );
    assert.equal(
      (await db.query<{count: number}>(
        "SELECT count(*)::integer AS count FROM account_wallets",
      )).rows[0]!.count,
      0,
    );

    await db.query(
      `INSERT INTO account_wallets (
        workspace_id,owner_user_id,provider,provider_wallet_id,
        provider_external_id,provider_chain_type,provider_owner_id,
        provider_owner_type,label,control_model,status
      ) VALUES ($1,$2,'privy',$3,$4,'ethereum',$5,'user',
        'Sprue account wallet','user_owned','active')`,
      [
        owner.workspaceId,
        owner.userId,
        providerWallet.id,
        providerWallet.externalId,
        privyUserId,
      ],
    );
    await seedReferenceData(client);

    const repaired = await service.ensure({
      workspaceId: owner.workspaceId,
      userId: owner.userId,
      privyUserId,
    });
    assert.equal(providerCalls, 2);
    assert.equal(repaired.addresses.length, 1);
    assert.equal(repaired.addresses[0]!.address, providerWallet.address);
    assert.equal(
      (await db.query<{count: number}>(
        "SELECT count(*)::integer AS count FROM account_wallets",
      )).rows[0]!.count,
      1,
    );
    assert.equal(
      (await db.query<{count: number}>(
        "SELECT count(*)::integer AS count FROM wallet_addresses",
      )).rows[0]!.count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("Privy wallet adapter binds the verified user and reads Base Sepolia USDC", async () => {
  const sprueUserId = "984a8ef2-f3b0-4cf1-8fb1-7f425c8c83c5";
  const privyUserId = "did:privy:verified-owner";
  const expectedExternalId = "sprue_984a8ef2f3b04cf18fb17f425c8c83c5";
  let listInput: unknown;
  let createInput: unknown;
  let balanceInput: unknown;
  const wallet = {
    id: "wallet-provider-id",
    chain_type: "ethereum",
    external_id: expectedExternalId,
    address: `0x${"b".repeat(40)}`,
  };
  const client = {
    wallets: () => ({
      list(input: unknown) {
        listInput = input;
        return (async function* () {})();
      },
      async create(input: unknown) {
        createInput = input;
        return wallet;
      },
      balance: {
        async get(walletId: string, query: unknown) {
          balanceInput = {walletId, query};
          return {
            balances: [{
              chain: "base_sepolia",
              asset: "USDC",
              raw_value: "1250000",
              raw_value_decimals: 6,
            }],
          };
        },
      },
    }),
  };
  const provider = privyWalletProvider("unused-app", "unused-secret", client as never);

  const provisioned = await provider.findOrCreateUserWallet({
    privyUserId,
    sprueUserId,
  });
  assert.deepEqual(listInput, {
    chain_type: "ethereum",
    external_id: expectedExternalId,
    user_id: privyUserId,
  });
  assert.deepEqual(createInput, {
    chain_type: "ethereum",
    display_name: "Sprue account wallet",
    external_id: expectedExternalId,
    owner: {user_id: privyUserId},
    idempotency_key: `sprue-wallet-${sprueUserId}`,
  });
  assert.deepEqual(provisioned, {
    id: wallet.id,
    externalId: expectedExternalId,
    address: wallet.address,
    chainType: "ethereum",
    ownerPrivyUserId: privyUserId,
  });

  const balance = await provider.readGraphFundingBalance(wallet.id);
  assert.deepEqual(balanceInput, {
    walletId: wallet.id,
    query: {asset: "usdc", chain: "base_sepolia"},
  });
  assert.equal(balance?.balanceAtomic, "1250000");
  assert.equal(balance?.decimals, 6);
});

test("Privy wallet adapter retries transient failures with redacted structured logs", async () => {
  const sprueUserId = "984a8ef2-f3b0-4cf1-8fb1-7f425c8c83c5";
  const privyUserId = "did:privy:sensitive-owner";
  const expectedExternalId = "sprue_984a8ef2f3b04cf18fb17f425c8c83c5";
  const sensitiveProviderMessage = `timeout for ${privyUserId}`;
  const events: LogEvent[] = [];
  const delays: number[] = [];
  let listCalls = 0;
  let createCalls = 0;
  const wallet = {
    id: "wallet-provider-id",
    chain_type: "ethereum",
    external_id: expectedExternalId,
    address: `0x${"c".repeat(40)}`,
  };
  const client = {
    wallets: () => ({
      list() {
        listCalls += 1;
        if (listCalls === 1) {
          return (async function* () {
            throw new APIConnectionTimeoutError({message: sensitiveProviderMessage});
          })();
        }
        return (async function* () {})();
      },
      async create() {
        createCalls += 1;
        return wallet;
      },
      balance: {
        async get() {
          return {balances: []};
        },
      },
    }),
  };
  const provider = privyWalletProvider(
    "unused-app",
    "unused-secret",
    client as never,
    {
      logger: {write: (event) => events.push(event)},
      maxAttempts: 2,
      baseDelayMs: 7,
      sleep: async (delayMs) => { delays.push(delayMs); },
    },
  );

  await provider.findOrCreateUserWallet({privyUserId, sprueUserId});

  assert.equal(listCalls, 2);
  assert.equal(createCalls, 1);
  assert.deepEqual(delays, [7]);
  assert.deepEqual(events, [
    {
      event: "provider_retry_scheduled",
      provider: "privy",
      operation: "wallet_list",
      attempt: 1,
      maxAttempts: 2,
      delayMs: 7,
      reason: "timeout",
      status: null,
    },
    {
      event: "provider_request_recovered",
      provider: "privy",
      operation: "wallet_list",
      attempts: 2,
    },
  ]);
  assert.equal(JSON.stringify(events).includes(privyUserId), false);
  assert.equal(JSON.stringify(events).includes(sensitiveProviderMessage), false);
  assert.equal(JSON.stringify(events).includes(wallet.id), false);
  assert.equal(JSON.stringify(events).includes(wallet.address), false);
});

test("Privy wallet creation retry reuses the same body and idempotency key", async () => {
  const sprueUserId = "984a8ef2-f3b0-4cf1-8fb1-7f425c8c83c5";
  const privyUserId = "did:privy:create-retry-owner";
  const expectedExternalId = "sprue_984a8ef2f3b04cf18fb17f425c8c83c5";
  const createInputs: unknown[] = [];
  const events: LogEvent[] = [];
  const wallet = {
    id: "wallet-provider-id",
    chain_type: "ethereum",
    external_id: expectedExternalId,
    address: `0x${"d".repeat(40)}`,
  };
  const client = {
    wallets: () => ({
      list() {
        return (async function* () {})();
      },
      async create(input: unknown) {
        createInputs.push(input);
        if (createInputs.length === 1) {
          throw new APIError(
            503,
            {message: "temporary provider failure with sensitive detail"},
            undefined,
            new Headers(),
          );
        }
        return wallet;
      },
      balance: {
        async get() {
          return {balances: []};
        },
      },
    }),
  };
  const provider = privyWalletProvider(
    "unused-app",
    "unused-secret",
    client as never,
    {
      logger: {write: (event) => events.push(event)},
      maxAttempts: 2,
      baseDelayMs: 0,
      sleep: async () => {},
    },
  );

  await provider.findOrCreateUserWallet({privyUserId, sprueUserId});

  assert.equal(createInputs.length, 2);
  assert.deepEqual(createInputs[1], createInputs[0]);
  assert.equal(
    (createInputs[0] as {idempotency_key?: string}).idempotency_key,
    `sprue-wallet-${sprueUserId}`,
  );
  assert.deepEqual(events.map((event) => event.event), [
    "provider_retry_scheduled",
    "provider_request_recovered",
  ]);
  assert.equal(JSON.stringify(events).includes("sensitive detail"), false);
});

test("Privy wallet adapter does not retry permission failures", async () => {
  const events: LogEvent[] = [];
  let createCalls = 0;
  let sleepCalls = 0;
  const client = {
    wallets: () => ({
      list() {
        return (async function* () {})();
      },
      async create() {
        createCalls += 1;
        throw new APIError(
          403,
          {message: "permission denied for a sensitive provider resource"},
          undefined,
          new Headers(),
        );
      },
      balance: {
        async get() {
          return {balances: []};
        },
      },
    }),
  };
  const provider = privyWalletProvider(
    "unused-app",
    "unused-secret",
    client as never,
    {
      logger: {write: (event) => events.push(event)},
      maxAttempts: 3,
      sleep: async () => { sleepCalls += 1; },
    },
  );

  await assert.rejects(
    provider.findOrCreateUserWallet({
      privyUserId: "did:privy:permission-owner",
      sprueUserId: "984a8ef2-f3b0-4cf1-8fb1-7f425c8c83c5",
    }),
    WalletProviderError,
  );

  assert.equal(createCalls, 1);
  assert.equal(sleepCalls, 0);
  assert.deepEqual(events, [{
    event: "provider_request_failed",
    provider: "privy",
    operation: "wallet_create",
    attempts: 1,
    reason: "client_error",
    status: 403,
    retryable: false,
    retryExhausted: false,
  }]);
  assert.equal(JSON.stringify(events).includes("sensitive provider resource"), false);
});

test("Hedera account activation is idempotent, durable, and workspace isolated", async () => {
  const db = new PGlite();
  const client = clientFor(db);
  try {
    await migrate(client, await readMigrations());
    await seedReferenceData(client);
    const privyUserId = "did:privy:hedera-owner";
    const evmAddress = `0x${"c".repeat(40)}`;
    const privy: PrivyWalletPort = {
      async findOrCreateUserWallet({sprueUserId}) {
        return {
          id: "privy-wallet-hedera",
          externalId: `sprue_${sprueUserId.replaceAll("-", "")}`,
          address: evmAddress,
          chainType: "ethereum",
          ownerPrivyUserId: privyUserId,
        };
      },
      async readGraphFundingBalance() {
        return null;
      },
    };
    let activated = false;
    let accountComplete = false;
    let activationCalls = 0;
    const observation = {
      accountId: "0.0.45678",
      evmAddress,
      balanceAtomic: "100000000",
      balanceConsensusTimestamp: "1757289600.000000000",
      accountCompletionStatus: "hollow" as const,
      receiverSignatureRequired: false,
      canReceive: true,
      canSpend: false as const,
      observedAt: new Date("2026-09-08T00:00:00.000Z"),
      activationTransactionId: "0.0.98@1757289600.000000000",
    };
    const hedera: HederaAccountPort = {
      activationAvailable: true,
      async readAccount() {
        return activated
          ? accountComplete
            ? {...observation, accountCompletionStatus: "complete", canSpend: true}
            : observation
          : null;
      },
      async ensureAccount(address) {
        assert.equal(address, evmAddress);
        activationCalls += 1;
        activated = true;
        return observation;
      },
    };
    const service = new WalletService(
      postgresWalletRepository(client),
      privy,
      graphCredentials(client),
      {
        provider: hedera,
        commandFingerprintKey: Buffer.alloc(32, 9),
        fingerprintKeyVersion: "test-v1",
      },
    );
    const auth = new AuthService(
      postgresAuthRepository(async () => ({
        query: (sql, parameters) => db.query(sql, parameters),
        release() {},
      })),
      service,
    );
    const identity = await auth.bootstrap({provider: "privy", subject: privyUserId});
    const initial = await service.readAccess(identity.defaultWorkspaceId);
    const walletId = initial.wallets[0]!.id;
    assert.equal(initial.wallets[0]!.addresses.some((address) => address.addressKind === "hedera_account_id"), false);

    const idempotencyKey = `hedera-${randomUUID()}`;
    const activatedView = await service.activateHedera({
      workspaceId: identity.defaultWorkspaceId,
      userId: identity.user.id,
      walletId,
      idempotencyKey,
    });
    assert.equal(activationCalls, 1);
    assert.equal(activatedView.balances.find((balance) => balance.symbol === "HBAR")?.displayAmount, "1");
    const hollowAddress = activatedView.wallets[0]!.addresses.find(
      (address) => address.addressKind === "hedera_account_id",
    );
    assert.equal(hollowAddress?.address, "0.0.45678");
    assert.equal(hollowAddress?.controlStatus, "pending");
    assert.equal(hollowAddress?.canReceive, false);
    assert.equal(hollowAddress?.canSpend, false);
    assert.equal(activatedView.recipientCapabilities[0]?.canReceive, true);
    assert.equal(activatedView.recipientCapabilities[0]?.canSpend, false);

    accountComplete = true;
    const completedView = await service.readAccess(identity.defaultWorkspaceId);
    const completedAddress = completedView.wallets[0]!.addresses.find(
      (address) => address.addressKind === "hedera_account_id",
    );
    assert.equal(completedAddress?.accountCompletionStatus, "complete");
    assert.equal(completedAddress?.controlStatus, "verified");
    assert.equal(completedAddress?.canReceive, true);
    assert.equal(completedAddress?.canSpend, true);
    assert.equal(completedView.recipientCapabilities[0]?.canSpend, true);
    assert.equal(completedView.readiness.find((item) => item.kind === "hedera_recipient")?.status, "ready");

    await service.activateHedera({
      workspaceId: identity.defaultWorkspaceId,
      userId: identity.user.id,
      walletId,
      idempotencyKey,
    });
    assert.equal(activationCalls, 1);
    const commands = await db.query<{status: string; count: number}>(
      "SELECT status,count(*)::integer AS count FROM control_commands GROUP BY status",
    );
    assert.deepEqual(commands.rows, [{status: "succeeded", count: 1}]);

    const foreign = await createOwner(db);
    await assert.rejects(
      service.activateHedera({
        workspaceId: foreign.workspaceId,
        userId: foreign.userId,
        walletId,
        idempotencyKey: `hedera-${randomUUID()}`,
      }),
      WalletNotFoundError,
    );
  } finally {
    await db.close();
  }
});
