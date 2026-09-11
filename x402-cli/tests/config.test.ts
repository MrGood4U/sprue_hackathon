import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {PrivateKey} from "@x402/hedera";
import {loadWalletConfig, saveWallet, saveWalletConfig, unlockWallet} from "../src/config.js";
import {publicWalletFromPrivateKey} from "../src/hedera.js";

test("wallet files round-trip encrypted private key material", async () => {
  const parent = await mkdtemp(join(tmpdir(), "hx402-test-"));
  const home = join(parent, "wallet");
  try {
    const privateKey = PrivateKey.generateECDSA();
    const config = publicWalletFromPrivateKey(privateKey, "hedera:testnet", null, "100000000");
    await saveWallet(home, config, privateKey.toStringRaw(), "correct horse battery staple");
    assert.deepEqual(await loadWalletConfig(home), config);
    assert.equal(await unlockWallet(home, "correct horse battery staple"), privateKey.toStringRaw());
    await assert.rejects(unlockWallet(home, "incorrect password"), /could not be unlocked/);

    const updated = {...config, accountId: "0.0.1234", updatedAt: new Date().toISOString()};
    await saveWalletConfig(home, updated);
    assert.deepEqual(await loadWalletConfig(home), updated);
  } finally {
    await rm(parent, {recursive: true, force: true});
  }
});
