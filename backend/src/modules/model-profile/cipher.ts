import {createCipheriv, createDecipheriv, createHmac, randomBytes} from "node:crypto";
import type {ModelProfileRecord, SealedModelCredential} from "./contracts.js";
import {ModelProfileStorageError} from "./contracts.js";

export interface ModelCredentialKeyring {
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}

function additionalData(workspaceId: string, secretVersion: number): Buffer {
  return Buffer.from(`sprue:model-profile:${workspaceId}:${secretVersion}`, "utf8");
}

export class ModelCredentialCipher {
  constructor(private readonly keyring: ModelCredentialKeyring) {
    if (!keyring.keys.has(keyring.activeKeyId)) throw new ModelProfileStorageError();
  }

  seal(workspaceId: string, secretVersion: number, apiKey: string): SealedModelCredential {
    const key = this.keyring.keys.get(this.keyring.activeKeyId);
    if (!key || key.byteLength !== 32) throw new ModelProfileStorageError();
    const iv = randomBytes(12);
    const plaintext = Buffer.from(apiKey, "utf8");
    try {
      const cipher = createCipheriv("aes-256-gcm", key, iv, {authTagLength: 16});
      cipher.setAAD(additionalData(workspaceId, secretVersion));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {
        ciphertext,
        keyId: this.keyring.activeKeyId,
        iv,
        authTag: cipher.getAuthTag(),
        fingerprint: createHmac("sha256", key).update(plaintext).digest("hex"),
      };
    } finally {
      plaintext.fill(0);
    }
  }

  open(record: Pick<ModelProfileRecord, "workspaceId" | "secretVersion" | "encryptionKeyId" | "encryptionIv" | "encryptionAuthTag" | "apiKeyCiphertext">): string {
    const key = this.keyring.keys.get(record.encryptionKeyId);
    if (!key || key.byteLength !== 32) throw new ModelProfileStorageError();
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, record.encryptionIv, {authTagLength: 16});
      decipher.setAAD(additionalData(record.workspaceId, record.secretVersion));
      decipher.setAuthTag(record.encryptionAuthTag);
      const plaintext = Buffer.concat([
        decipher.update(record.apiKeyCiphertext),
        decipher.final(),
      ]);
      try {
        return plaintext.toString("utf8");
      } finally {
        plaintext.fill(0);
      }
    } catch (error) {
      if (error instanceof ModelProfileStorageError) throw error;
      throw new ModelProfileStorageError();
    }
  }
}
