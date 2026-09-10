import type pg from "pg";
import {randomUUID} from "node:crypto";
import type {ImmutableLivePlan} from "./live-plan.js";
import {contentHash} from "./live-plan.js";
import {LiveDeploymentError, type LiveDeploymentRepository} from "./contracts.js";

function asPlan(value: unknown): ImmutableLivePlan {
  return value as ImmutableLivePlan;
}

export function postgresLiveDeploymentRepository(pool: pg.Pool): LiveDeploymentRepository {
  return {
    async persistVersion(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const product = await client.query(
          `SELECT id FROM data_products
           WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL
           FOR UPDATE`,
          [input.workspaceId, input.productId],
        );
        if (!product.rows[0]) throw new Error("PRODUCT_NOT_FOUND");
        const snapshotIds = new Map<string, string>();
        for (const source of input.sources) {
          const snapshotId = randomUUID();
          const inserted = await client.query(
            `INSERT INTO source_snapshots (
              id,workspace_id,provider,source_kind,logical_source_id,
              gateway_target_type,gateway_target_id,manifest_ipfs_cid,
              data_network_ref,schema_format,schema_document,schema_hash,
              discovery_method,status,observed_at,validated_at
            ) VALUES ($1,$2,'the_graph','subgraph',$3,'manifest_ipfs_cid',$4,$4,$5,
              'graphql_sdl',$6,$7,'graph_mcp','validated',now(),now())
            ON CONFLICT (workspace_id,provider,gateway_target_type,gateway_target_id,schema_hash)
            DO UPDATE SET validated_at=source_snapshots.validated_at
            RETURNING id`,
            [snapshotId, input.workspaceId, source.logicalSubgraphId, source.manifestIpfsCid,
              source.dataNetwork, source.schemaDocument, source.schemaHash],
          );
          snapshotIds.set(source.id, String(inserted.rows[0]!.id));
        }
        const plan = input.createPlan(snapshotIds);
        const specHash = contentHash(plan);
        const existing = await client.query(
          `SELECT id,version_no FROM data_product_versions
           WHERE data_product_id=$1 AND spec_hash=$2 AND status='ready'
           ORDER BY version_no DESC LIMIT 1`,
          [input.productId, specHash],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return {id: String(existing.rows[0].id), versionNo: Number(existing.rows[0].version_no), specHash};
        }
        const next = await client.query(
          "SELECT COALESCE(max(version_no),0)+1 AS version_no FROM data_product_versions WHERE data_product_id=$1",
          [input.productId],
        );
        const versionId = randomUUID();
        const versionNo = Number(next.rows[0]!.version_no);
        await client.query(
          `INSERT INTO data_product_versions (
            id,data_product_id,version_no,created_by_user_id,spec_schema_version,
            specification_json,spec_hash,output_schema_json,status,
            validation_summary_json,validated_at,ready_at
          ) VALUES ($1,$2,$3,$4,2,$5::jsonb,$6,$7::jsonb,'ready',$8::jsonb,now(),now())`,
          [versionId, input.productId, versionNo, input.actorUserId, plan, specHash,
            plan.outputSchema, {passed: true, compiler: plan.compiler, runtimeVersion: plan.runtimeVersion}],
        );
        for (const source of input.sources) {
          const snapshotId = snapshotIds.get(source.id)!;
          const sourceConfig = plan.sources.find((item) => item.id === source.id)!;
          await client.query(
            `INSERT INTO data_product_version_sources (
              data_product_version_id,source_key,source_snapshot_id,access_mode,
              provider_credential_id,gateway_environment,adapter_version,source_config_hash
            ) VALUES ($1,$2,$3,'customer_api_key',$4,'mainnet','graph-mcp-live-v1',$5)`,
            [versionId, source.id, snapshotId, source.providerCredentialId, contentHash(sourceConfig)],
          );
        }
        await client.query("COMMIT");
        return {id: versionId, versionNo, specHash};
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deploy(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          `SELECT p.creator_user_id,v.id AS version_id,d.id AS deployment_id
           FROM data_products p
           JOIN LATERAL (
             SELECT id FROM data_product_versions
             WHERE data_product_id=p.id AND status='ready'
             ORDER BY version_no DESC LIMIT 1
           ) v ON true
           LEFT JOIN deployments d
             ON d.data_product_id=p.id AND d.environment='local'
           WHERE p.workspace_id=$1 AND p.id=$2 AND p.deleted_at IS NULL
           FOR UPDATE OF p`,
          [input.workspaceId, input.productId],
        );
        if (!selected.rows[0]) throw new LiveDeploymentError("READY_VERSION_NOT_FOUND");
        const deploymentId = selected.rows[0].deployment_id
          ? String(selected.rows[0].deployment_id)
          : randomUUID();
        const accepted = await client.query(
          `INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,finished_at
          ) VALUES ($1,$2,'deploy_data_product',$3,$4,$5,'succeeded',
            'not_supported',false,'deployment',$6,now())
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id`,
          [input.actorUserId, input.workspaceId, input.idempotencyKey,
            input.requestFingerprint, input.fingerprintKeyVersion, deploymentId],
        );
        const ownerUserId = String(selected.rows[0].creator_user_id);
        if (!accepted.rows[0]) {
          const replay = await client.query(
            `SELECT c.request_fingerprint,c.subject_id,
              d.id,d.endpoint_slug,d.active_version_id,d.status,
              k.id AS credential_id,k.name AS credential_name,
              k.key_prefix,k.created_at AS credential_created_at
             FROM control_commands c
             LEFT JOIN deployments d ON d.id=c.subject_id
             LEFT JOIN api_credentials k
               ON k.deployment_id=d.id AND k.key_hash=$4
             WHERE c.actor_user_id=$1 AND c.workspace_id=$2
               AND c.operation='deploy_data_product' AND c.idempotency_key=$3`,
            [input.actorUserId, input.workspaceId, input.idempotencyKey, input.credential.hash],
          );
          const row = replay.rows[0];
          if (!row
            || String(row.request_fingerprint) !== input.requestFingerprint
            || String(row.subject_id) !== deploymentId
            || !row.credential_id) {
            await client.query("ROLLBACK");
            return {kind: "command_conflict"};
          }
          await client.query("COMMIT");
          return {
            kind: "replayed",
            deployment: {
              id: String(row.id), productId: input.productId, ownerUserId,
              alias: String(row.endpoint_slug),
              endpointUrl: `${input.publicBaseUrl.replace(/\/$/, "")}/${ownerUserId}/${input.productId}`,
              activeVersionId: String(row.active_version_id), status: "healthy",
            },
            credential: {
              id: String(row.credential_id),
              name: String(row.credential_name),
              prefix: String(row.key_prefix),
            },
            createdAt: new Date(String(row.credential_created_at)),
          };
        }
        const deployed = await client.query(
          `INSERT INTO deployments (
            id,workspace_id,data_product_id,environment,runtime_target,provider,
            endpoint_slug,public_base_url,active_version_id,status,last_health_at
          ) VALUES ($1,$2,$3,'local','shared_hosted','local',$4,$5,$6,'healthy',now())
          ON CONFLICT (data_product_id,environment) DO UPDATE SET
            endpoint_slug=EXCLUDED.endpoint_slug,
            public_base_url=EXCLUDED.public_base_url,
            active_version_id=EXCLUDED.active_version_id,
            active_materialization_id=NULL,
            status='healthy',last_health_at=now(),updated_at=now(),
            lock_version=deployments.lock_version+1
          RETURNING id,active_version_id,created_at`,
          [deploymentId, input.workspaceId, input.productId, input.alias, input.publicBaseUrl,
            String(selected.rows[0].version_id)],
        );
        const row = deployed.rows[0]!;
        const issued = await client.query(
          `INSERT INTO api_credentials (
            id,workspace_id,deployment_id,name,key_prefix,key_hash,scopes_json,
            status,created_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'active',$8)
          RETURNING id,name,key_prefix,created_at`,
          [input.credential.id, input.workspaceId, String(row.id), input.credential.name,
            input.credential.prefix, input.credential.hash,
            {version: 1, methods: ["GET"], productId: input.productId}, input.actorUserId],
        );
        await client.query("COMMIT");
        const issuedRow = issued.rows[0]!;
        return {
          kind: "deployed",
          deployment: {
            id: String(row.id), productId: input.productId, ownerUserId, alias: input.alias,
            endpointUrl: `${input.publicBaseUrl.replace(/\/$/, "")}/${ownerUserId}/${input.productId}`,
            activeVersionId: String(row.active_version_id), status: "healthy",
          },
          credential: {
            id: String(issuedRow.id),
            name: String(issuedRow.name),
            prefix: String(issuedRow.key_prefix),
          },
          createdAt: new Date(String(issuedRow.created_at)),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        if (typeof error === "object" && error !== null
          && "code" in error && error.code === "23505"
          && "constraint" in error && error.constraint === "uq_020") {
          throw new LiveDeploymentError("DEPLOYMENT_ALIAS_CONFLICT");
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async loadAuthorized(input) {
      const result = await pool.query(
        `SELECT d.id AS deployment_id,d.workspace_id,d.data_product_id,
          p.creator_user_id,d.active_version_id,v.specification_json,v.spec_hash,c.id AS credential_id
         FROM deployments d
         JOIN data_products p ON p.id=d.data_product_id AND p.deleted_at IS NULL
         JOIN data_product_versions v ON v.id=d.active_version_id AND v.status='ready'
         JOIN api_credentials c ON c.deployment_id=d.id
         WHERE p.creator_user_id=$1
           AND (p.id::text=$2 OR d.endpoint_slug=$2)
           AND d.status='healthy' AND c.key_hash=$3 AND c.status='active'
           AND (c.expires_at IS NULL OR c.expires_at>now())
         LIMIT 1`,
        [input.ownerUserId, input.productRef, input.keyHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      await pool.query("UPDATE api_credentials SET last_used_at=now() WHERE id=$1", [row.credential_id]);
      return {
        deploymentId: String(row.deployment_id), workspaceId: String(row.workspace_id),
        productId: String(row.data_product_id), ownerUserId: String(row.creator_user_id),
        activeVersionId: String(row.active_version_id), specification: asPlan(row.specification_json),
        specHash: String(row.spec_hash), apiCredentialId: String(row.credential_id),
      };
    },

    async loadExport(workspaceId, productId) {
      const result = await pool.query(
        `SELECT p.name,v.id AS version_id,v.specification_json,v.spec_hash
         FROM data_products p
         JOIN LATERAL (
           SELECT id,specification_json,spec_hash FROM data_product_versions
           WHERE data_product_id=p.id AND status='ready'
           ORDER BY version_no DESC LIMIT 1
         ) v ON true
         WHERE p.workspace_id=$1 AND p.id=$2 AND p.deleted_at IS NULL`,
        [workspaceId, productId],
      );
      const row = result.rows[0];
      return row ? {
        productName: String(row.name), versionId: String(row.version_id),
        specHash: String(row.spec_hash), specification: asPlan(row.specification_json),
      } : null;
    },
  };
}
