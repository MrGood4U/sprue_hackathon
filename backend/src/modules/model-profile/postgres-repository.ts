import type {SqlClient} from "../../db/migrations.js";
import {
  modelProfileProtocol,
  type ModelProfileRecord,
  type ModelProfileRepository,
  type ModelProfileWrite,
} from "./contracts.js";

const projection = `id, workspace_id, created_by_user_id, updated_by_user_id,
  protocol, api_url, model_name, api_key_ciphertext, encryption_key_id,
  encryption_iv, encryption_auth_tag, secret_version, credential_fingerprint,
  created_at, updated_at, lock_version`;

function record(row: Record<string, unknown>): ModelProfileRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    createdByUserId: String(row.created_by_user_id),
    updatedByUserId: String(row.updated_by_user_id),
    protocol: modelProfileProtocol,
    apiUrl: String(row.api_url),
    model: String(row.model_name),
    apiKeyCiphertext: Buffer.from(row.api_key_ciphertext as Uint8Array),
    encryptionKeyId: String(row.encryption_key_id),
    encryptionIv: Buffer.from(row.encryption_iv as Uint8Array),
    encryptionAuthTag: Buffer.from(row.encryption_auth_tag as Uint8Array),
    secretVersion: Number(row.secret_version),
    credentialFingerprint: String(row.credential_fingerprint),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    lockVersion: Number(row.lock_version),
  };
}

export function postgresModelProfileRepository(
  client: Pick<SqlClient, "query">,
): ModelProfileRepository {
  return {
    async findByWorkspace(workspaceId) {
      const result = await client.query(
        `SELECT ${projection} FROM agent_model_profiles WHERE workspace_id=$1`,
        [workspaceId],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },

    async compareAndSwap(input: ModelProfileWrite) {
      const parameters = [
        input.workspaceId,
        input.actorUserId,
        input.protocol,
        input.apiUrl,
        input.model,
        input.sealed.ciphertext,
        input.sealed.keyId,
        input.sealed.iv,
        input.sealed.authTag,
        input.secretVersion,
        input.sealed.fingerprint,
      ];
      const result = input.expectedLockVersion === null
        ? await client.query(
            `INSERT INTO agent_model_profiles (
              workspace_id, created_by_user_id, updated_by_user_id, protocol,
              api_url, model_name, api_key_ciphertext, encryption_key_id,
              encryption_iv, encryption_auth_tag, secret_version,
              credential_fingerprint
            ) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (workspace_id) DO NOTHING
            RETURNING ${projection}`,
            parameters,
          )
        : await client.query(
            `UPDATE agent_model_profiles SET
              updated_by_user_id=$2, protocol=$3, api_url=$4, model_name=$5,
              api_key_ciphertext=$6, encryption_key_id=$7, encryption_iv=$8,
              encryption_auth_tag=$9, secret_version=$10,
              credential_fingerprint=$11, updated_at=now(),
              lock_version=lock_version+1
            WHERE workspace_id=$1 AND lock_version=$12
            RETURNING ${projection}`,
            [...parameters, input.expectedLockVersion],
          );
      return result.rows[0] ? record(result.rows[0]) : null;
    },
  };
}
