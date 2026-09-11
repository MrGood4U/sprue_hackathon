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

    async suspend(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT d.id,d.data_product_id,d.endpoint_slug,d.public_base_url,d.active_version_id,
            p.creator_user_id
           FROM deployments d
           JOIN data_products p ON p.id=d.data_product_id AND p.deleted_at IS NULL
           WHERE d.workspace_id=$1 AND d.id=$2
           FOR UPDATE OF d`,
          [input.workspaceId, input.deploymentId],
        );
        const row = result.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE deployments SET status='suspended',active_publication_version_id=NULL,
            updated_at=now(),lock_version=lock_version+1 WHERE id=$1`,
          [input.deploymentId],
        );
        await client.query(
          `UPDATE publication_versions SET status='retired'
           WHERE deployment_id=$1 AND status='active'`,
          [input.deploymentId],
        );
        await client.query(
          `UPDATE api_credentials SET status='revoked',revoked_at=now()
           WHERE deployment_id=$1 AND status='active'`,
          [input.deploymentId],
        );
        await client.query("COMMIT");
        const ownerUserId = String(row.creator_user_id);
        return {
          id: String(row.id), productId: String(row.data_product_id), ownerUserId,
          alias: String(row.endpoint_slug),
          endpointUrl: `${String(row.public_base_url).replace(/\/$/, "")}/${ownerUserId}/${String(row.data_product_id)}`,
          activeVersionId: String(row.active_version_id), status: "suspended" as const,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async loadPublicationCandidate(workspaceId, deploymentId) {
      const result = await pool.query(
        `SELECT d.id AS deployment_id,d.workspace_id,d.data_product_id,p.name AS product_name,
          p.creator_user_id,d.active_version_id,
          n.id AS network_id,a.id AS asset_id,wa.id AS wallet_address_id,
          wa.network_account_ref
         FROM deployments d
         JOIN data_products p ON p.id=d.data_product_id AND p.deleted_at IS NULL
         JOIN networks n ON n.namespace='hedera' AND n.reference='testnet' AND n.environment='testnet'
         JOIN assets a ON a.network_id=n.id AND a.asset_identifier='0.0.0'
           AND a.standard='native' AND a.asset_type='fungible'
         JOIN account_wallets aw ON aw.workspace_id=d.workspace_id
           AND aw.owner_user_id=p.creator_user_id AND aw.status='active'
         JOIN wallet_addresses wa ON wa.account_wallet_id=aw.id AND wa.network_id=n.id
           AND wa.status='active' AND wa.identity_status='resolved'
           AND wa.account_completion_status='complete' AND wa.control_status='verified'
           AND wa.can_receive=true AND wa.can_spend=true AND wa.network_account_ref IS NOT NULL
         JOIN LATERAL (
           SELECT c.id FROM wallet_asset_capabilities c
           WHERE c.wallet_address_id=wa.id AND c.asset_id=a.id AND c.status='active'
             AND c.can_receive=true AND c.can_spend=true
           ORDER BY c.observed_at DESC,c.id DESC LIMIT 1
         ) capability ON true
         WHERE d.workspace_id=$1 AND d.id=$2 AND d.status='healthy'
           AND d.active_version_id IS NOT NULL
         ORDER BY aw.updated_at DESC,wa.verified_at DESC NULLS LAST LIMIT 1`,
        [workspaceId, deploymentId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const ownerUserId = String(row.creator_user_id);
      return {
        deploymentId: String(row.deployment_id), workspaceId: String(row.workspace_id),
        productId: String(row.data_product_id), productName: String(row.product_name), ownerUserId,
        activeVersionId: String(row.active_version_id),
        networkId: String(row.network_id), assetId: String(row.asset_id),
        recipientWalletAddressId: String(row.wallet_address_id),
        recipientAddress: String(row.network_account_ref),
      };
    },

    async publishX402(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const locked = await client.query(
          `SELECT id FROM deployments
           WHERE id=$1 AND workspace_id=$2 AND data_product_id=$3
             AND active_version_id=$4 AND status='healthy'
           FOR UPDATE`,
          [input.candidate.deploymentId, input.candidate.workspaceId,
            input.candidate.productId, input.candidate.activeVersionId],
        );
        if (!locked.rows[0]) {
          throw new LiveDeploymentError("X402_PUBLICATION_PREREQUISITES_MISSING");
        }
        const existing = await client.query(
          `SELECT pv.id,pv.revision_no,pv.status,pv.price_atomic,
            wa.network_account_ref,pv.created_at
           FROM publication_versions pv
           JOIN wallet_addresses wa ON wa.id=pv.recipient_wallet_address_id
           WHERE pv.deployment_id=$1 AND pv.status='active' AND pv.access_mode='x402'
           ORDER BY pv.revision_no DESC LIMIT 1`,
          [input.candidate.deploymentId],
        );
        if (existing.rows[0]) {
          const row = existing.rows[0];
          await client.query("COMMIT");
          return {
            id: String(row.id), deploymentId: input.candidate.deploymentId,
            revisionNo: Number(row.revision_no), status: "active" as const,
            priceAtomic: String(row.price_atomic), recipientAddress: String(row.network_account_ref),
            network: "hedera:testnet" as const, asset: "0.0.0" as const,
            facilitator: "blocky402" as const, createdAt: new Date(String(row.created_at)),
          };
        }
        const next = await client.query(
          "SELECT coalesce(max(revision_no),0)+1 AS revision_no FROM publication_versions WHERE deployment_id=$1",
          [input.candidate.deploymentId],
        );
        const publicationId = input.publicationId;
        const inserted = await client.query(
          `INSERT INTO publication_versions (
            id,deployment_id,revision_no,access_mode,serve_mode,network_id,asset_id,
            price_atomic,recipient_wallet_address_id,payment_protocol_version,payment_scheme,
            max_timeout_seconds,facilitator,facilitator_config_ref,facilitator_capability_json,
            facilitator_capability_hash,facilitator_capability_observed_at,service_fee_enabled,
            accepted_by_user_id,accepted_at,status
          ) VALUES ($1,$2,$3,'x402','live',$4,$5,$6,$7,'2','exact',$8,'blocky402',$9,
            $10::jsonb,$11,now(),false,$12,now(),'active')
          RETURNING revision_no,created_at`,
          [publicationId, input.candidate.deploymentId, Number(next.rows[0]!.revision_no),
            input.candidate.networkId, input.candidate.assetId, input.priceAtomic,
            input.candidate.recipientWalletAddressId, input.requirements.maxTimeoutSeconds,
            input.facilitatorUrl, input.facilitatorCapability, input.facilitatorCapabilityHash,
            input.actorUserId],
        );
        await client.query(
          `INSERT INTO api_credentials (
            id,workspace_id,deployment_id,name,key_prefix,key_hash,scopes_json,status,created_by_user_id
          ) VALUES ($1,$2,$3,'Internal x402 execution key',$4,$5,$6::jsonb,'active',$7)`,
          [input.internalCredential.id, input.candidate.workspaceId, input.candidate.deploymentId,
            input.internalCredential.prefix, input.internalCredential.hash,
            {version: 1, kind: "x402_internal", publicationId, methods: ["GET"], productId: input.candidate.productId},
            input.actorUserId],
        );
        await client.query(
          `UPDATE deployments SET active_publication_version_id=$2,
            updated_at=now(),lock_version=lock_version+1 WHERE id=$1`,
          [input.candidate.deploymentId, publicationId],
        );
        await client.query("COMMIT");
        const row = inserted.rows[0]!;
        return {
          id: publicationId, deploymentId: input.candidate.deploymentId,
          revisionNo: Number(row.revision_no), status: "active" as const,
          priceAtomic: input.priceAtomic, recipientAddress: input.candidate.recipientAddress,
          network: "hedera:testnet" as const, asset: "0.0.0" as const,
          facilitator: "blocky402" as const, createdAt: new Date(String(row.created_at)),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async retireX402(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT pv.id,pv.revision_no,pv.status,pv.price_atomic,pv.created_at,
            wa.network_account_ref
           FROM publication_versions pv
           JOIN deployments d ON d.id=pv.deployment_id
           JOIN wallet_addresses wa ON wa.id=pv.recipient_wallet_address_id
           WHERE d.workspace_id=$1 AND d.id=$2 AND pv.id=$3 AND pv.access_mode='x402'
           FOR UPDATE OF d,pv`,
          [input.workspaceId, input.deploymentId, input.publicationId],
        );
        const row = result.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE deployments SET active_publication_version_id=NULL,
            updated_at=now(),lock_version=lock_version+1
           WHERE id=$1 AND active_publication_version_id=$2`,
          [input.deploymentId, input.publicationId],
        );
        await client.query("UPDATE publication_versions SET status='retired' WHERE id=$1", [input.publicationId]);
        await client.query(
          `UPDATE api_credentials SET status='revoked',revoked_at=now()
           WHERE deployment_id=$1 AND status='active'
             AND scopes_json->>'kind'='x402_internal'
             AND scopes_json->>'publicationId'=$2`,
          [input.deploymentId, input.publicationId],
        );
        await client.query("COMMIT");
        return {
          id: String(row.id), deploymentId: input.deploymentId,
          revisionNo: Number(row.revision_no), status: "retired" as const,
          priceAtomic: String(row.price_atomic), recipientAddress: String(row.network_account_ref),
          network: "hedera:testnet" as const, asset: "0.0.0" as const,
          facilitator: "blocky402" as const, createdAt: new Date(String(row.created_at)),
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async loadX402Gate(ownerUserId, productRef) {
      const result = await pool.query(
        `SELECT d.id AS deployment_id,d.workspace_id,d.data_product_id,p.name AS product_name,
          p.creator_user_id,d.active_version_id,pv.id AS publication_id,
          pv.price_atomic,pv.max_timeout_seconds,pv.facilitator_capability_json,
          n.id AS network_id,a.id AS asset_id,wa.id AS wallet_address_id,wa.network_account_ref,
          c.id AS internal_credential_id
         FROM deployments d
         JOIN data_products p ON p.id=d.data_product_id AND p.deleted_at IS NULL
         JOIN publication_versions pv ON pv.id=d.active_publication_version_id
           AND pv.status='active' AND pv.access_mode='x402' AND pv.serve_mode='live'
         JOIN networks n ON n.id=pv.network_id AND n.namespace='hedera' AND n.reference='testnet'
         JOIN assets a ON a.id=pv.asset_id AND a.asset_identifier='0.0.0'
         JOIN wallet_addresses wa ON wa.id=pv.recipient_wallet_address_id
         JOIN api_credentials c ON c.deployment_id=d.id AND c.status='active'
           AND c.scopes_json->>'kind'='x402_internal'
           AND c.scopes_json->>'publicationId'=pv.id::text
         WHERE p.creator_user_id=$1 AND (p.id::text=$2 OR d.endpoint_slug=$2)
           AND d.status='healthy' LIMIT 1`,
        [ownerUserId, productRef],
      );
      const row = result.rows[0];
      if (!row) return null;
      const capability = row.facilitator_capability_json as {extra?: {feePayer?: unknown}};
      if (typeof capability?.extra?.feePayer !== "string") return null;
      return {
        deploymentId: String(row.deployment_id), workspaceId: String(row.workspace_id),
        productId: String(row.data_product_id), productName: String(row.product_name),
        ownerUserId: String(row.creator_user_id), activeVersionId: String(row.active_version_id),
        networkId: String(row.network_id), assetId: String(row.asset_id),
        recipientWalletAddressId: String(row.wallet_address_id),
        recipientAddress: String(row.network_account_ref), publicationId: String(row.publication_id),
        priceAtomic: String(row.price_atomic), internalCredentialId: String(row.internal_credential_id),
        requirements: {
          scheme: "exact", network: "hedera:testnet", amount: String(row.price_atomic),
          payTo: String(row.network_account_ref), maxTimeoutSeconds: Number(row.max_timeout_seconds),
          asset: "0.0.0", extra: {feePayer: capability.extra.feePayer},
        },
      };
    },

    async beginPaidRequest(input) {
      const client = await pool.connect();
      const requestId = randomUUID();
      const paymentIntentId = randomUUID();
      const paymentAttemptId = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO payment_intents (
            id,workspace_id,data_product_id,kind,network_id,asset_id,amount_atomic,
            recipient_wallet_address_id,recipient_address,facilitator,payment_protocol,
            payment_protocol_version,payment_scheme,network_fee_payer_address,
            max_timeout_seconds,resource_ref,requirement_json,selected_requirement_json,requirement_hash,
            idempotency_key,status,expires_at
          ) VALUES ($1,$2,$3,'api_sale',$4,$5,$6,$7,$8,'blocky402','x402','2','exact',$9,
            $10::integer,$11,$12::jsonb,$12::jsonb,$13,$14,'submitted',
            now()+make_interval(secs => $10::double precision))`,
          [paymentIntentId, input.gate.workspaceId, input.gate.productId, input.gate.networkId,
            input.gate.assetId, input.gate.priceAtomic, input.gate.recipientWalletAddressId,
            input.gate.recipientAddress, input.gate.requirements.extra.feePayer,
            input.gate.requirements.maxTimeoutSeconds, input.resourceUrl,
            input.gate.requirements, input.requestHash, input.idempotencyKey],
        );
        await client.query(
          `INSERT INTO api_access_requests (
            id,workspace_id,deployment_id,data_product_version_id,publication_version_id,
            api_credential_id,correlation_id,idempotency_key,method,path,parameters_json,
            request_hash,payment_intent_id,status,started_at,recovery_capability_hash,
            recovery_hash_key_version,recovery_expires_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'GET',$9,$10::jsonb,$11,$12,'authorized',now(),
            $13,'x402-recovery-v1',now()+interval '10 minutes')`,
          [requestId, input.gate.workspaceId, input.gate.deploymentId, input.gate.activeVersionId,
            input.gate.publicationId, input.gate.internalCredentialId, input.correlationId,
            input.idempotencyKey, input.path, {limit: input.limit}, input.requestHash,
            paymentIntentId, input.recoveryCapabilityHash],
        );
        await client.query(
          `INSERT INTO payment_attempts (
            id,payment_intent_id,attempt_no,network_id,provider,provider_operation,
            authorization_hash,status,requested_at,submitted_at
          ) VALUES ($1,$2,1,$3,'blocky402','verify_and_settle',$4,'submitted',now(),now())`,
          [paymentAttemptId, paymentIntentId, input.gate.networkId, input.authorizationHash],
        );
        await client.query(
          `INSERT INTO api_payment_proofs (authorization_hash,api_access_request_id,payment_intent_id)
           VALUES ($1,$2,$3)`,
          [input.authorizationHash, requestId, paymentIntentId],
        );
        await client.query("COMMIT");
        return {requestId, paymentIntentId, paymentAttemptId};
      } catch (error) {
        await client.query("ROLLBACK");
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") return null;
        throw error;
      } finally {
        client.release();
      }
    },

    async failPaidRequest(input) {
      await pool.query(
         `WITH failed_intent AS (
           UPDATE payment_intents SET status='failed',updated_at=now()
           WHERE id=$1 AND status<>'confirmed' AND $5=false
         ), failed_attempt AS (
           UPDATE payment_attempts SET status='failed',error_code=$4
           WHERE id=$2 AND status<>'confirmed' AND $5=false
         )
         UPDATE api_access_requests SET status='failed',completed_at=now(),error_code=$4 WHERE id=$3`,
        [input.paymentIntentId, input.paymentAttemptId, input.requestId, input.code,
          input.preservePayment ?? false],
      );
    },

    async confirmPaidSettlement(input) {
      const client = await pool.connect();
      const settlementId = randomUUID();
      const grossAllocationId = randomUUID();
      const creatorAllocationId = randomUUID();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO payment_settlements (
            id,payment_intent_id,payment_attempt_id,network_id,asset_id,provider,
            provider_transaction_ref,network_transaction_id,payer_address,fee_payer_address,
            recipient_address,amount_atomic,result_code,evidence_sources_json,evidence_json,
            evidence_hash,status,reported_at,confirmed_at
          ) VALUES ($1,$2,$3,$4,$5,'blocky402',$6,$6,$7,$8,$9,$10,'SUCCESS',$11::jsonb,
            $12::jsonb,$13,'confirmed',now(),now())`,
          [settlementId, input.paymentIntentId, input.paymentAttemptId, input.gate.networkId,
            input.gate.assetId, input.transaction, input.payerAddress,
            input.gate.requirements.extra.feePayer, input.gate.recipientAddress,
            input.gate.priceAtomic, ["blocky402"], input.settlementEvidence,
            contentHash(input.settlementEvidence)],
        );
        for (const [id, type] of [[grossAllocationId, "gross_sale"], [creatorAllocationId, "creator_proceeds"]] as const) {
          await client.query(
            `INSERT INTO payment_allocations (
              id,payment_intent_id,allocation_type,beneficiary_wallet_address_id,
              beneficiary_ref,amount_atomic,status,confirmed_at
            ) VALUES ($1,$2,$3,$4,$5,$6,'confirmed',now())`,
            [id, input.paymentIntentId, type, input.gate.recipientWalletAddressId,
              input.gate.recipientAddress, input.gate.priceAtomic],
          );
          await client.query(
            `INSERT INTO financial_ledger_entries (
              id,workspace_id,data_product_id,payment_intent_id,payment_allocation_id,
              wallet_address_id,entry_type,accounting_view,direction,network_id,asset_id,
              amount_atomic,recognition_status,source_key,occurred_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,'economic_allocation','memo',$8,$9,$10,
              'confirmed',$11,now())`,
            [randomUUID(), input.gate.workspaceId, input.gate.productId, input.paymentIntentId,
              id, input.gate.recipientWalletAddressId, type, input.gate.networkId,
              input.gate.assetId, input.gate.priceAtomic, `x402:${input.paymentIntentId}:${type}`],
          );
        }
        await client.query(
          `UPDATE payment_attempts SET status='confirmed',provider_transaction_ref=$2,
            settled_at=now(),sanitized_result_json=$3::jsonb WHERE id=$1`,
          [input.paymentAttemptId, input.transaction, input.settlementEvidence],
        );
        await client.query(
          "UPDATE payment_intents SET status='confirmed',updated_at=now() WHERE id=$1",
          [input.paymentIntentId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async completePaidRequest(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE api_access_requests SET status='served',completed_at=now(),error_code=NULL
           WHERE id=$1`,
          [input.requestId],
        );
        await client.query(
          `INSERT INTO api_http_attempts (
            id,api_access_request_id,attempt_no,has_payment_authorization,
            payment_authorization_hash,http_status,response_content_hash,response_byte_count,
            started_at,completed_at
          ) SELECT $1,$2,1,true,p.authorization_hash,200,$3,$4,requested_at,now()
            FROM payment_attempts p WHERE p.id=$5`,
          [randomUUID(), input.requestId, input.responseContentHash,
            String(input.responseByteCount), input.paymentAttemptId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
