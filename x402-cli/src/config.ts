import {createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback} from "node:crypto";
import {homedir} from "node:os";
import {dirname, join} from "node:path";
import {mkdir, chmod, readFile, rename, stat, writeFile} from "node:fs/promises";
import {promisify} from "node:util";

export type HederaNetwork = "hedera:testnet" | "hedera:mainnet";

export interface WalletConfig {
  version: 1;
  network: HederaNetwork;
  accountId: string | null;
  evmAddress: string;
  publicKey: string;
  maxPaymentTinybar: string;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedSecret {
  version: 1;
  kdf: "scrypt";
  cipher: "aes-256-gcm";
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

const scrypt = promisify(scryptCallback);

export function cliHome(environment: NodeJS.ProcessEnv = process.env): string {
  const override = environment.HX402_HOME?.trim();
  return override || join(homedir(), ".hedera-x402");
}

export function walletPaths(home: string) {
  return {
    config: join(home, "config.json"),
    secret: join(home, "wallet.key"),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function atomicWrite(path: string, data: string, mode: number): Promise<void> {
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, data, {encoding: "utf8", mode, flag: "wx"});
  await rename(temporary, path);
  await chmod(path, mode).catch(() => undefined);
}

function isWalletConfig(value: unknown): value is WalletConfig {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WalletConfig>;
  return item.version === 1
    && (item.network === "hedera:testnet" || item.network === "hedera:mainnet")
    && (item.accountId === null || typeof item.accountId === "string")
    && typeof item.evmAddress === "string"
    && /^0x[0-9a-f]{40}$/.test(item.evmAddress)
    && typeof item.publicKey === "string"
    && /^[0-9a-f]+$/i.test(item.publicKey)
    && typeof item.maxPaymentTinybar === "string"
    && /^(0|[1-9][0-9]*)$/.test(item.maxPaymentTinybar)
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string";
}

function isEncryptedSecret(value: unknown): value is EncryptedSecret {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<EncryptedSecret>;
  return item.version === 1
    && item.kdf === "scrypt"
    && item.cipher === "aes-256-gcm"
    && [item.salt, item.iv, item.authTag, item.ciphertext].every((entry) =>
      typeof entry === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(entry));
}

async function encryptPrivateKey(privateKey: string, passphrase: string): Promise<EncryptedSecret> {
  if (passphrase.length < 8) throw new Error("The wallet passphrase must contain at least 8 characters.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = Buffer.from(await scrypt(passphrase, salt, 32) as ArrayBuffer);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return {
    version: 1,
    kdf: "scrypt",
    cipher: "aes-256-gcm",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

async function decryptPrivateKey(secret: EncryptedSecret, passphrase: string): Promise<string> {
  try {
    const salt = Buffer.from(secret.salt, "base64");
    const key = Buffer.from(await scrypt(passphrase, salt, 32) as ArrayBuffer);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(secret.iv, "base64"));
    decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("The wallet could not be unlocked. Check the passphrase.");
  }
}

export async function walletExists(home: string): Promise<boolean> {
  const paths = walletPaths(home);
  return (await exists(paths.config)) || (await exists(paths.secret));
}

export async function saveWallet(
  home: string,
  config: WalletConfig,
  privateKey: string,
  passphrase: string,
  overwrite = false,
): Promise<void> {
  if (!overwrite && await walletExists(home)) {
    throw new Error(`A wallet already exists in ${home}. Use --force only after backing it up.`);
  }
  const paths = walletPaths(home);
  const secret = await encryptPrivateKey(privateKey, passphrase);
  await atomicWrite(paths.secret, `${JSON.stringify(secret, null, 2)}\n`, 0o600);
  await atomicWrite(paths.config, `${JSON.stringify(config, null, 2)}\n`, 0o600);
}

export async function loadWalletConfig(home: string): Promise<WalletConfig> {
  const path = walletPaths(home).config;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No wallet is configured in ${home}. Run \"hx402-cli wallet create\" or \"hx402-cli wallet import\".`);
    }
    throw new Error(`The wallet configuration in ${path} is unreadable.`);
  }
  if (!isWalletConfig(value)) throw new Error(`The wallet configuration in ${path} is invalid.`);
  return value;
}

export async function saveWalletConfig(home: string, config: WalletConfig): Promise<void> {
  await atomicWrite(walletPaths(home).config, `${JSON.stringify(config, null, 2)}\n`, 0o600);
}

export async function unlockWallet(home: string, passphrase: string): Promise<string> {
  const path = walletPaths(home).secret;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`The encrypted wallet key is missing from ${path}.`);
    throw new Error(`The encrypted wallet key in ${path} is unreadable.`);
  }
  if (!isEncryptedSecret(value)) throw new Error(`The encrypted wallet key in ${path} is invalid.`);
  return decryptPrivateKey(value, passphrase);
}
