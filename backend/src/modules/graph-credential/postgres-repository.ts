import type {SqlClient} from "../../db/migrations.js";
import type {
  GraphCredentialCreate,
  GraphCredentialRecord,
  GraphCredentialRepository,
  GraphCredentialSecretRecord,
} from "./contracts.js";

const projection = `id,workspace_id,created_by_user_id,label,secret_ref,
  secret_version,public_prefix,credential_fingerprint,status,validated_at,
  last_used_at,revoked_at,provider_constraints_json,created_at,updated_at,
  lock_version,is_selected`;

function record(row: Record<string, unknown>): GraphCredentialRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    createdByUserId: String(row.created_by_user_id),
    label: String(row.label),
    secretRef: String(row.secret_ref),
    secretVersion: String(row.secret_version),
    publicPrefix:
      typeof row.public_prefix === "string" ? row.public_prefix : null,
    fingerprint: String(row.credential_fingerprint),
    status: String(row.status) as GraphCredentialRecord["status"],
    isSelected: Boolean(row.is_selected),
    validatedAt: row.validated_at ? new Date(String(row.validated_at)) : null,
    lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)) : null,
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)) : null,
    observedConstraints:
      row.provider_constraints_json &&
      typeof row.provider_constraints_json === "object" &&
      !Array.isArray(row.provider_constraints_json)
        ? (row.provider_constraints_json as Record<string, unknown>)
        : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    lockVersion: Number(row.lock_version),
  };
}

export function postgresGraphCredentialRepository(
  client: Pick<SqlClient, "query">,
): GraphCredentialRepository {
  return {
    async list(workspaceId) {
      const result = await client.query(
        `SELECT ${projection} FROM provider_credentials
        WHERE workspace_id=$1 AND provider='the_graph' AND status<>'revoked'
        ORDER BY created_at,id`,
        [workspaceId],
      );
      return result.rows.map(record);
    },

    async findByLabelOrFingerprint(workspaceId, label, fingerprint) {
      const result = await client.query(
        `SELECT ${projection} FROM provider_credentials
        WHERE workspace_id=$1 AND provider='the_graph'
          AND (label=$2 OR credential_fingerprint=$3)
        ORDER BY CASE WHEN label=$2 AND credential_fingerprint=$3 THEN 0 ELSE 1 END
        LIMIT 1`,
        [workspaceId, label, fingerprint],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },

    async create(input: GraphCredentialCreate) {
      const result = await client.query(
        `WITH created AS (
          INSERT INTO provider_credentials (
            id,workspace_id,created_by_user_id,provider,credential_type,
            ownership_model,billing_model,label,secret_ref,secret_version,
            public_prefix,credential_fingerprint,status
          ) VALUES (
            $1,$2,$3,'the_graph','graph_api_key','customer_supplied',
            'customer_subscription',$4,$5,$6,$7,$8,'pending_validation'
          )
          ON CONFLICT DO NOTHING
          RETURNING ${projection}
        ), stored AS (
          INSERT INTO provider_credential_secrets (
            provider_credential_id,api_key_ciphertext,encryption_key_id,
            encryption_iv,encryption_auth_tag,secret_version
          )
          SELECT id,$9,$10,$11,$12,$13 FROM created
          RETURNING provider_credential_id
        )
        SELECT created.* FROM created
        JOIN stored ON stored.provider_credential_id=created.id`,
        [
          input.id,
          input.workspaceId,
          input.actorUserId,
          input.label,
          input.secretRef,
          String(input.secretVersion),
          input.publicPrefix,
          input.sealed.fingerprint,
          input.sealed.ciphertext,
          input.sealed.keyId,
          input.sealed.iv,
          input.sealed.authTag,
          input.secretVersion,
        ],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },

    async findSecret(workspaceId, credentialId) {
      const result = await client.query(
        `SELECT pc.*,pcs.api_key_ciphertext,pcs.encryption_key_id,
          pcs.encryption_iv,pcs.encryption_auth_tag,
          pcs.secret_version AS encrypted_secret_version
        FROM provider_credentials pc
        JOIN provider_credential_secrets pcs ON pcs.provider_credential_id=pc.id
        WHERE pc.workspace_id=$1 AND pc.id=$2 AND pc.provider='the_graph'`,
        [workspaceId, credentialId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        ...record(row),
        providerCredentialId: String(row.id),
        ciphertext: Buffer.from(row.api_key_ciphertext as Uint8Array),
        encryptionKeyId: String(row.encryption_key_id),
        encryptionIv: Buffer.from(row.encryption_iv as Uint8Array),
        encryptionAuthTag: Buffer.from(row.encryption_auth_tag as Uint8Array),
        encryptedSecretVersion: Number(row.encrypted_secret_version),
      } satisfies GraphCredentialRecord & GraphCredentialSecretRecord;
    },

    async find(workspaceId, credentialId) {
      const result = await client.query(
        `SELECT ${projection} FROM provider_credentials
        WHERE workspace_id=$1 AND id=$2 AND provider='the_graph'`,
        [workspaceId, credentialId],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },

    async setValidation(input) {
      const result = await client.query(
        `UPDATE provider_credentials
        SET status=$4,
            is_selected=CASE WHEN $4='active' THEN is_selected ELSE false END,
            validated_at=CASE WHEN $4='active' THEN $5::timestamptz ELSE NULL END,
            provider_constraints_json=$6::jsonb,
            updated_at=$5::timestamptz,
            lock_version=lock_version+1
        WHERE workspace_id=$1 AND id=$2 AND provider='the_graph'
          AND status<>'revoked' AND lock_version=$3
        RETURNING ${projection}`,
        [
          input.workspaceId,
          input.credentialId,
          input.expectedLockVersion,
          input.status,
          input.observedAt,
          input.observedConstraints,
        ],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },

    async select(input) {
      const result = await client.query(
        `WITH target AS MATERIALIZED (
          SELECT id FROM provider_credentials
          WHERE workspace_id=$1 AND id=$2 AND provider='the_graph'
            AND status='active' AND lock_version=$3
          FOR UPDATE
        ), cleared AS MATERIALIZED (
          UPDATE provider_credentials
          SET is_selected=false,updated_at=now(),lock_version=lock_version+1
          WHERE workspace_id=$1 AND provider='the_graph' AND is_selected
            AND id<>(SELECT id FROM target)
          RETURNING id
        )
        UPDATE provider_credentials
        SET is_selected=true,updated_at=now(),lock_version=lock_version+1
        WHERE workspace_id=$1 AND provider='the_graph'
          AND id=(SELECT id FROM target)
          AND (SELECT count(*) FROM cleared)>=0
        RETURNING ${projection}`,
        [input.workspaceId, input.credentialId, input.expectedLockVersion],
      );
      const selected = result.rows.find(
        (row) => String(row.id) === input.credentialId,
      );
      return selected ? record(selected) : null;
    },

    async revoke(input) {
      const result = await client.query(
        `WITH revoked AS (
          UPDATE provider_credentials
          SET status='revoked',is_selected=false,revoked_at=now(),
              updated_at=now(),lock_version=lock_version+1
          WHERE workspace_id=$1 AND id=$2 AND provider='the_graph'
            AND status<>'revoked' AND lock_version=$3
          RETURNING ${projection}
        ), removed AS (
          DELETE FROM provider_credential_secrets secrets
          USING revoked
          WHERE secrets.provider_credential_id=revoked.id
          RETURNING secrets.provider_credential_id
        )
        SELECT revoked.* FROM revoked
        JOIN removed ON removed.provider_credential_id=revoked.id`,
        [input.workspaceId, input.credentialId, input.expectedLockVersion],
      );
      return result.rows[0] ? record(result.rows[0]) : null;
    },
  };
}
