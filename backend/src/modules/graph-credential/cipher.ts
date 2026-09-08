import {createCipheriv, createDecipheriv, createHmac, randomBytes} from "node:crypto";
import type {ModelCredentialKeyring} from "../model-profile/cipher.js";
import type {
  GraphCredentialSecretRecord,
  SealedGraphCredential,
} from "./contracts.js";
import {GraphCredentialStorageError} from "./contracts.js";

function additionalData(
  workspaceId: string,
  credentialId: string,
  secretVersion: number,
): Buffer {
  return Buffer.from(
    `sprue:graph-credential:${workspaceId}:${credentialId}:${secretVersion}`,
    "utf8",
  );
}

export class GraphCredentialCipher {
  constructor(private readonly keyring: ModelCredentialKeyring) {
    if (!keyring.keys.has(keyring.activeKeyId)) {
      throw new GraphCredentialStorageError();
    }
  }

  seal(
    workspaceId: string,
    credentialId: string,
    secretVersion: number,
    apiKey: string,
  ): SealedGraphCredential {
    const key = this.keyring.keys.get(this.keyring.activeKeyId);
    if (!key || key.byteLength !== 32) throw new GraphCredentialStorageError();
    const iv = randomBytes(12);
    const plaintext = Buffer.from(apiKey, "utf8");
    try {
      const cipher = createCipheriv("aes-256-gcm", key, iv, {
        authTagLength: 16,
      });
      cipher.setAAD(additionalData(workspaceId, credentialId, secretVersion));
      return {
        ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]),
        keyId: this.keyring.activeKeyId,
        iv,
        authTag: cipher.getAuthTag(),
        fingerprint: createHmac("sha256", key)
          .update(plaintext)
          .digest("hex"),
      };
    } finally {
      plaintext.fill(0);
    }
  }

  open(
    workspaceId: string,
    record: GraphCredentialSecretRecord,
  ): string {
    const key = this.keyring.keys.get(record.encryptionKeyId);
    if (!key || key.byteLength !== 32) throw new GraphCredentialStorageError();
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, record.encryptionIv, {
        authTagLength: 16,
      });
      decipher.setAAD(
        additionalData(
          workspaceId,
          record.providerCredentialId,
          record.encryptedSecretVersion,
        ),
      );
      decipher.setAuthTag(record.encryptionAuthTag);
      const plaintext = Buffer.concat([
        decipher.update(record.ciphertext),
        decipher.final(),
      ]);
      try {
        return plaintext.toString("utf8");
      } finally {
        plaintext.fill(0);
      }
    } catch (error) {
      if (error instanceof GraphCredentialStorageError) throw error;
      throw new GraphCredentialStorageError();
    }
  }
}
