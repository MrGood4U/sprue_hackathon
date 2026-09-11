import type {SqlClient} from "../../db/migrations.js";
import type {
  DeploymentSummary,
  DeliveryContract,
  DeliveryDeployment,
  DeliveryPublication,
  DeliverySale,
  DeliveryVersion,
  Money,
  ProductDeliveryView,
  ProductDetail,
  ProductRepository,
  ProductStatus,
  ProductSummary,
  RunStatus,
  RunSummary,
  VersionStatus,
  VersionSummary,
  WorkspaceOverview,
} from "./contracts.js";

const productProjection = `
  p.id,p.workspace_id,p.creator_user_id,p.account_wallet_id,p.slug,p.name,p.description,
  p.original_intent,p.status,p.created_at,p.updated_at,p.lock_version,
  lv.id AS version_id,lv.version_no,lv.source_count AS version_source_count,
  lv.parent_version_id,lv.spec_hash,
  lv.status AS version_status,lv.validated_at,lv.ready_at,
  lv.created_at AS version_created_at,
  dep.id AS deployment_id,dep.environment AS deployment_environment,
  dep.status AS deployment_status,dep.endpoint_slug,dep.public_base_url,
  dep.active_version_id,dep.active_materialization_id,
  dep.active_publication_version_id,dep.access_mode,
  dep.source_freshness_at,
  lr.id AS run_id,lr.data_product_version_id AS run_version_id,
  lr.run_type,lr.status AS run_status,lr.failure_code,lr.queued_at,
  lr.started_at,lr.finished_at`;

const productJoins = `
  LEFT JOIN LATERAL (
    SELECT v.*,
      (SELECT count(*)::text FROM data_product_version_sources s
       WHERE s.data_product_version_id=v.id) AS source_count
    FROM data_product_versions v
    WHERE v.data_product_id=p.id
    ORDER BY v.version_no DESC,v.id DESC LIMIT 1
  ) lv ON true
  LEFT JOIN LATERAL (
    SELECT d.*,pv.access_mode,m.source_freshness_at
    FROM deployments d
    LEFT JOIN publication_versions pv
      ON pv.id=d.active_publication_version_id
    LEFT JOIN materializations m ON m.id=d.active_materialization_id
    WHERE d.workspace_id=p.workspace_id AND d.data_product_id=p.id
    ORDER BY
      CASE d.status WHEN 'healthy' THEN 0 WHEN 'deploying' THEN 1 ELSE 2 END,
      d.updated_at DESC,d.id DESC
    LIMIT 1
  ) dep ON true
  LEFT JOIN LATERAL (
    SELECT r.* FROM execution_runs r
    WHERE r.workspace_id=p.workspace_id AND r.data_product_id=p.id
    ORDER BY r.queued_at DESC,r.id DESC LIMIT 1
  ) lr ON true`;

function timestamp(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : new Date(String(value)).toISOString();
}

function version(row: Record<string, unknown>): VersionSummary | null {
  if (!row.version_id) return null;
  return {
    id: String(row.version_id),
    versionNo: Number(row.version_no),
    sourceCount: String(row.version_source_count),
    parentVersionId: row.parent_version_id ? String(row.parent_version_id) : null,
    specHash: String(row.spec_hash),
    status: String(row.version_status) as VersionStatus,
    validatedAt: timestamp(row.validated_at),
    readyAt: timestamp(row.ready_at),
    createdAt: timestamp(row.version_created_at)!,
  };
}

function endpointUrl(base: unknown, ownerUserId: unknown, productId: unknown) {
  if (typeof base !== "string" || !base) return null;
  return `${base.replace(/\/$/, "")}/${String(ownerUserId)}/${String(productId)}`;
}

function deployment(row: Record<string, unknown>): DeploymentSummary | null {
  if (!row.deployment_id) return null;
  return {
    id: String(row.deployment_id),
    environment: String(row.deployment_environment) as DeploymentSummary["environment"],
    status: String(row.deployment_status) as DeploymentSummary["status"],
    endpointSlug: String(row.endpoint_slug),
    endpointUrl: endpointUrl(row.public_base_url, row.creator_user_id, row.id),
    activeVersionId: row.active_version_id ? String(row.active_version_id) : null,
    activeMaterializationId: row.active_materialization_id
      ? String(row.active_materialization_id)
      : null,
    activePublicationVersionId: row.active_publication_version_id
      ? String(row.active_publication_version_id)
      : null,
    accessMode: row.access_mode
      ? String(row.access_mode) as DeploymentSummary["accessMode"]
      : null,
    sourceFreshnessAt: timestamp(row.source_freshness_at),
  };
}

function run(row: Record<string, unknown>): RunSummary | null {
  if (!row.run_id) return null;
  return {
    id: String(row.run_id),
    productId: String(row.id),
    versionId: String(row.run_version_id),
    runType: String(row.run_type) as RunSummary["runType"],
    status: String(row.run_status) as RunStatus,
    failureCode: row.failure_code ? String(row.failure_code) : null,
    queuedAt: timestamp(row.queued_at)!,
    startedAt: timestamp(row.started_at),
    finishedAt: timestamp(row.finished_at),
  };
}

function nextAction(
  latestVersion: VersionSummary | null,
  activeDeployment: DeploymentSummary | null,
  latestRun: RunSummary | null,
): ProductSummary["nextAction"] {
  if (latestRun && ["queued", "running", "blocked", "failed"].includes(latestRun.status)) {
    return "inspect_run";
  }
  if (!latestVersion || ["proposed", "validating", "invalid"].includes(latestVersion.status)) {
    return "open_builder";
  }
  if (latestVersion.status === "ready" && !activeDeployment?.activeVersionId) return "deploy";
  if (activeDeployment && ["degraded", "suspended", "failed"].includes(activeDeployment.status)) {
    return "resolve_access";
  }
  if (latestVersion.status === "building") return "inspect_run";
  return null;
}

function summary(row: Record<string, unknown>): ProductSummary {
  const latestVersion = version(row);
  const activeDeployment = deployment(row);
  const latestRun = run(row);
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    status: String(row.status) as ProductStatus,
    updatedAt: timestamp(row.updated_at)!,
    latestVersion,
    activeDeployment,
    latestRun,
    nextAction: nextAction(latestVersion, activeDeployment, latestRun),
  };
}

function detail(row: Record<string, unknown>): ProductDetail {
  return {
    ...summary(row),
    workspaceId: String(row.workspace_id),
    accountWalletId: String(row.account_wallet_id),
    originalIntent: String(row.original_intent),
    createdAt: timestamp(row.created_at)!,
    lockVersion: Number(row.lock_version),
  };
}

function money(value: unknown): Money[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          networkId: String(row.networkId),
          network: String(row.network),
          assetId: String(row.assetId),
          assetIdentifier: String(row.assetIdentifier),
          symbol: String(row.symbol),
          decimals: Number(row.decimals),
          amountAtomic: String(row.amountAtomic),
        };
      })
    : [];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_PRODUCT_DELIVERY_JSON");
  }
  return value as Record<string, unknown>;
}

function deliveryVersion(row: Record<string, unknown>, prefix: "latest" | "active"): DeliveryVersion | null {
  const id = row[`${prefix}_version_id`];
  if (!id) return null;
  return {
    id: String(id),
    versionNo: Number(row[`${prefix}_version_no`]),
    status: String(row[`${prefix}_version_status`]) as VersionStatus,
    outputSchema: record(row[`${prefix}_output_schema`]),
  };
}

function deliveryDeployment(row: Record<string, unknown>): DeliveryDeployment | null {
  if (!row.deployment_id) return null;
  const url = endpointUrl(row.public_base_url, row.creator_user_id, row.id);
  const base = typeof row.public_base_url === "string" && row.public_base_url
    ? row.public_base_url.replace(/\/data\/v1\/?$/, "")
    : null;
  return {
    id: String(row.deployment_id),
    environment: String(row.deployment_environment) as DeliveryDeployment["environment"],
    provider: String(row.deployment_provider) as DeliveryDeployment["provider"],
    status: String(row.deployment_status) as DeliveryDeployment["status"],
    endpointSlug: String(row.endpoint_slug),
    endpointUrl: url,
    publicProductUrl: base ? `${base}/p/${String(row.endpoint_slug)}` : null,
    activeVersionId: row.active_version_id ? String(row.active_version_id) : null,
    activeMaterializationId: row.active_materialization_id
      ? String(row.active_materialization_id)
      : null,
    lastHealthAt: timestamp(row.last_health_at),
    sourceFreshnessAt: timestamp(row.source_freshness_at),
    updatedAt: timestamp(row.deployment_updated_at)!,
  };
}

function apiReadiness(
  latestVersion: DeliveryVersion | null,
  deployment: DeliveryDeployment | null,
): ProductDeliveryView["api"]["readiness"] {
  if (!latestVersion) return "no_version";
  if (!deployment?.activeVersionId && latestVersion.status !== "ready") return "version_not_ready";
  if (!deployment) return "not_deployed";
  if (deployment.status === "deploying") return "deploying";
  if (
    deployment.status !== "healthy" ||
    !deployment.activeVersionId ||
    !deployment.endpointUrl
  ) return "unavailable";
  return "available";
}

function apiBlockers(readiness: ProductDeliveryView["api"]["readiness"]) {
  const details = {
    no_version: ["VERSION_MISSING", "No durable product version exists yet."],
    version_not_ready: ["VERSION_NOT_READY", "The latest durable product version is not ready."],
    not_deployed: ["DEPLOYMENT_MISSING", "No deployment exists for this product."],
    deploying: ["DEPLOYMENT_IN_PROGRESS", "The deployment has not finished."],
    unavailable: ["DEPLOYMENT_UNAVAILABLE", "The live deployment is not healthy with an active version and endpoint."],
  } as const;
  if (readiness === "available") return [];
  const [code, message] = details[readiness];
  return [{code, message}];
}

function deliveryContract(
  row: Record<string, unknown>,
  deployment: DeliveryDeployment | null,
  activeVersion: DeliveryVersion | null,
): DeliveryContract | null {
  if (!deployment?.endpointUrl || !activeVersion) return null;
  const accessMode = row.active_access_mode
    ? String(row.active_access_mode) as DeliveryContract["accessMode"]
    : "api_key";
  return {
    deploymentId: deployment.id,
    activeVersionId: activeVersion.id,
    method: "GET",
    endpointUrl: deployment.endpointUrl,
    accessMode,
    serveMode: "live",
    parameterSchema: [{
      name: "limit",
      location: "query",
      type: "integer",
      required: false,
      default: 100,
      minimum: 1,
      maximum: 1000,
    }],
    responseSchema: {
      mediaType: "application/json",
      outputSchema: activeVersion.outputSchema,
    },
    exampleBody: null,
  };
}

function price(row: Record<string, unknown>): Money | null {
  if (!row.publication_network_id || !row.publication_asset_id || row.price_atomic === null) return null;
  return {
    networkId: String(row.publication_network_id),
    network: `${String(row.network_namespace)}:${String(row.network_reference)}`,
    assetId: String(row.publication_asset_id),
    assetIdentifier: String(row.asset_identifier),
    symbol: String(row.asset_symbol),
    decimals: Number(row.asset_decimals),
    amountAtomic: String(row.price_atomic),
  };
}

function publication(row: Record<string, unknown> | undefined, x402EndpointUrl: string): DeliveryPublication | null {
  if (!row?.publication_id) return null;
  return {
    id: String(row.publication_id),
    endpointUrl: x402EndpointUrl,
    revisionNo: Number(row.revision_no),
    status: String(row.publication_status) as DeliveryPublication["status"],
    accessMode: "x402",
    serveMode: String(row.serve_mode) as DeliveryPublication["serveMode"],
    price: price(row),
    recipient: row.recipient_wallet_address_id ? {
      walletAddressId: String(row.recipient_wallet_address_id),
      networkAccountRef: row.network_account_ref ? String(row.network_account_ref) : null,
      identityStatus: String(row.identity_status) as NonNullable<DeliveryPublication["recipient"]>["identityStatus"],
      accountCompletionStatus: String(row.account_completion_status) as NonNullable<DeliveryPublication["recipient"]>["accountCompletionStatus"],
      controlStatus: String(row.control_status) as NonNullable<DeliveryPublication["recipient"]>["controlStatus"],
      canReceive: Boolean(row.recipient_can_receive) && Boolean(row.capability_can_receive),
      canSpend: Boolean(row.recipient_can_spend) && Boolean(row.capability_can_spend),
    } : null,
    paymentProtocolVersion: row.payment_protocol_version ? String(row.payment_protocol_version) : null,
    paymentScheme: row.payment_scheme ? String(row.payment_scheme) : null,
    maxTimeoutSeconds: row.max_timeout_seconds === null ? null : Number(row.max_timeout_seconds),
    facilitator: row.facilitator ? String(row.facilitator) : null,
    capabilityObservedAt: timestamp(row.facilitator_capability_observed_at),
    serviceFeeEnabled: Boolean(row.service_fee_enabled),
    createdAt: timestamp(row.publication_created_at)!,
  };
}

function monetizationReadiness(
  api: ProductDeliveryView["api"]["readiness"],
  value: DeliveryPublication | null,
): ProductDeliveryView["monetization"]["readiness"] {
  if (api !== "available") return "api_not_ready";
  if (!value) return "not_configured";
  if (value.status === "invalid") return "invalid";
  if (value.status === "retired") return "retired";
  if (value.status !== "active") return "draft";
  return "active";
}

function monetizationBlockers(
  readiness: ProductDeliveryView["monetization"]["readiness"],
  value: DeliveryPublication | null,
) {
  const blockers: ProductDeliveryView["monetization"]["blockers"] = [];
  if (readiness === "api_not_ready") blockers.push({code: "API_NOT_READY", message: "A healthy API deployment with a ready immutable live plan is required."});
  if (readiness === "not_configured") blockers.push({code: "PUBLICATION_NOT_CONFIGURED", message: "No Hedera x402 publication revision exists."});
  if (readiness === "draft") blockers.push({code: "PUBLICATION_NOT_ACTIVE", message: "The latest Hedera x402 publication is not active."});
  if (readiness === "invalid") blockers.push({code: "PUBLICATION_INVALID", message: "The latest Hedera x402 publication is invalid."});
  if (readiness === "retired") blockers.push({code: "PUBLICATION_RETIRED", message: "The latest Hedera x402 publication is retired."});
  if (value && (!value.recipient || value.recipient.identityStatus !== "resolved")) blockers.push({code: "RECIPIENT_UNRESOLVED", message: "The Hedera recipient account is not resolved."});
  if (value?.recipient && value.recipient.accountCompletionStatus !== "complete") blockers.push({code: "ACCOUNT_INCOMPLETE", message: "The Hedera recipient account is not complete."});
  if (value?.recipient && value.recipient.controlStatus !== "verified") blockers.push({code: "RECIPIENT_CONTROL_UNVERIFIED", message: "Creator control of the Hedera recipient is not verified."});
  if (value?.recipient && (!value.recipient.canReceive || !value.recipient.canSpend)) blockers.push({code: "ASSET_CAPABILITY_UNVERIFIED", message: "HBAR receive and later-spend capability are required."});
  if (value?.serviceFeeEnabled) blockers.push({code: "SERVICE_FEE_UNSUPPORTED", message: "The hackathon profile does not support a Sprue service fee."});
  return blockers;
}

function maskedAddress(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function sale(row: Record<string, unknown>): DeliverySale {
  return {
    id: String(row.request_id),
    correlationId: String(row.correlation_id),
    status: String(row.request_status) as DeliverySale["status"],
    amount: row.sale_network_id ? {
      networkId: String(row.sale_network_id),
      network: `${String(row.sale_network_namespace)}:${String(row.sale_network_reference)}`,
      assetId: String(row.sale_asset_id),
      assetIdentifier: String(row.sale_asset_identifier),
      symbol: String(row.sale_asset_symbol),
      decimals: Number(row.sale_asset_decimals),
      amountAtomic: String(row.sale_amount_atomic),
    } : null,
    payer: maskedAddress(row.payer_address),
    providerTransactionRef: row.provider_transaction_ref ? String(row.provider_transaction_ref) : null,
    networkTransactionId: row.network_transaction_id ? String(row.network_transaction_id) : null,
    networkTransactionHash: row.network_transaction_hash ? String(row.network_transaction_hash) : null,
    consensusTimestamp: row.consensus_timestamp ? String(row.consensus_timestamp) : null,
    startedAt: timestamp(row.started_at)!,
    completedAt: timestamp(row.completed_at),
  };
}

async function findProduct(
  client: Pick<SqlClient, "query">,
  workspaceId: string,
  productId: string,
) {
  const result = await client.query(
    `SELECT ${productProjection} FROM data_products p ${productJoins}
     WHERE p.workspace_id=$1 AND p.id=$2 AND p.deleted_at IS NULL`,
    [workspaceId, productId],
  );
  return result.rows[0] ? detail(result.rows[0]) : null;
}

export function postgresProductRepository(
  client: Pick<SqlClient, "query">,
  x402PublicBaseUrl: string,
): ProductRepository {
  return {
    async list(input) {
      const values: unknown[] = [input.workspaceId];
      const clauses = ["p.workspace_id=$1", "p.deleted_at IS NULL"];
      if (input.query) {
        values.push(`%${input.query.replace(/[\\%_]/g, "\\$&")}%`);
        clauses.push(`(p.name ILIKE $${values.length} ESCAPE '\\' OR coalesce(p.description,'') ILIKE $${values.length} ESCAPE '\\')`);
      }
      if (input.status) {
        values.push(input.status);
        clauses.push(`p.status=$${values.length}`);
      }
      if (input.cursor) {
        values.push(input.cursor.updatedAt.toISOString(), input.cursor.id);
        clauses.push(`(p.updated_at,p.id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
      }
      values.push(input.limit + 1);
      const result = await client.query(
        `SELECT ${productProjection} FROM data_products p ${productJoins}
         WHERE ${clauses.join(" AND ")}
         ORDER BY p.updated_at DESC,p.id DESC LIMIT $${values.length}`,
        values,
      );
      return {
        items: result.rows.slice(0, input.limit).map(summary),
        hasMore: result.rows.length > input.limit,
      };
    },

    find: (workspaceId, productId) => findProduct(client, workspaceId, productId),

    async create(input) {
      const result = await client.query(
        `WITH eligible_wallet AS MATERIALIZED (
          SELECT id FROM account_wallets
          WHERE id=$4 AND workspace_id=$2 AND owner_user_id=$3
            AND status IN ('active','restricted')
        ), accepted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,finished_at
          )
          SELECT $3,$2,'create_data_product',$9,$10,$11,'succeeded',
            'not_supported',false,'data_product',$1,now()
          FROM eligible_wallet
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING subject_id
        )
        INSERT INTO data_products (
          id,workspace_id,creator_user_id,account_wallet_id,slug,name,
          description,original_intent,status
        )
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,'draft' FROM accepted
        RETURNING id`,
        [
          input.id,
          input.workspaceId,
          input.actorUserId,
          input.accountWalletId,
          input.slug,
          input.name,
          input.description,
          input.originalIntent,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
        ],
      );
      if (result.rows[0]) {
        const product = await findProduct(client, input.workspaceId, input.id);
        if (!product) throw new Error("PRODUCT_CREATE_READ_FAILED");
        return {kind: "created", product};
      }
      const replay = await client.query(
        `SELECT request_fingerprint,subject_id FROM control_commands
         WHERE actor_user_id=$1 AND workspace_id=$2
           AND operation='create_data_product' AND idempotency_key=$3`,
        [input.actorUserId, input.workspaceId, input.idempotencyKey],
      );
      const command = replay.rows[0];
      if (command) {
        if (String(command.request_fingerprint) !== input.requestFingerprint) {
          return {kind: "command_conflict"};
        }
        const product = await findProduct(client, input.workspaceId, String(command.subject_id));
        if (!product) throw new Error("PRODUCT_REPLAY_READ_FAILED");
        return {kind: "replayed", product};
      }
      const wallet = await client.query(
        `SELECT id FROM account_wallets
         WHERE id=$1 AND workspace_id=$2 AND owner_user_id=$3
           AND status IN ('active','restricted')`,
        [input.accountWalletId, input.workspaceId, input.actorUserId],
      );
      return wallet.rows[0] ? {kind: "command_conflict"} : {kind: "wallet_not_found"};
    },

    async update(input) {
      const result = await client.query(
        `WITH target AS MATERIALIZED (
          SELECT id FROM data_products
          WHERE workspace_id=$1 AND id=$2 AND lock_version=$4
            AND deleted_at IS NULL
          FOR UPDATE
        ), accepted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,finished_at
          )
          SELECT $3,$1,'update_data_product',$8,$9,$10,'succeeded',
            'not_supported',false,'data_product',$2,now()
          FROM target
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id
        )
        UPDATE data_products p SET
          name=CASE WHEN $5::boolean THEN $6 ELSE p.name END,
          description=CASE WHEN $7::boolean THEN $11 ELSE p.description END,
          updated_at=now(),lock_version=p.lock_version+1
        FROM target,accepted
        WHERE p.id=target.id
        RETURNING p.id`,
        [
          input.workspaceId,
          input.productId,
          input.actorUserId,
          input.expectedLockVersion,
          input.name !== undefined,
          input.name ?? null,
          input.description !== undefined,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
          input.description ?? null,
        ],
      );
      if (result.rows[0]) {
        const product = await findProduct(client, input.workspaceId, input.productId);
        if (!product) throw new Error("PRODUCT_UPDATE_READ_FAILED");
        return {kind: "updated", product};
      }
      const replay = await client.query(
        `SELECT request_fingerprint,subject_id FROM control_commands
         WHERE actor_user_id=$1 AND workspace_id=$2
           AND operation='update_data_product' AND idempotency_key=$3`,
        [input.actorUserId, input.workspaceId, input.idempotencyKey],
      );
      const command = replay.rows[0];
      if (command) {
        if (
          String(command.request_fingerprint) !== input.requestFingerprint ||
          String(command.subject_id) !== input.productId
        ) return {kind: "command_conflict"};
        const product = await findProduct(client, input.workspaceId, input.productId);
        if (!product) return {kind: "not_found"};
        return {kind: "replayed", product};
      }
      const current = await client.query(
        "SELECT lock_version FROM data_products WHERE workspace_id=$1 AND id=$2 AND deleted_at IS NULL",
        [input.workspaceId, input.productId],
      );
      return current.rows[0] ? {kind: "precondition_failed"} : {kind: "not_found"};
    },

    async delete(input) {
      const result = await client.query(
        `WITH target AS MATERIALIZED (
          SELECT id FROM data_products
          WHERE workspace_id=$1 AND id=$2 AND lock_version=$4
            AND deleted_at IS NULL
          FOR UPDATE
        ), accepted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,finished_at
          )
          SELECT $3,$1,'delete_data_product',$5,$6,$7,'succeeded',
            'not_supported',false,'data_product',$2,now()
          FROM target
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id
        )
        UPDATE data_products p SET
          deleted_at=now(),updated_at=now(),lock_version=p.lock_version+1
        FROM target,accepted
        WHERE p.id=target.id
        RETURNING p.deleted_at`,
        [
          input.workspaceId,
          input.productId,
          input.actorUserId,
          input.expectedLockVersion,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
        ],
      );
      if (result.rows[0]) {
        return {
          kind: "deleted",
          deletion: {
            productId: input.productId,
            deletedAt: timestamp(result.rows[0].deleted_at)!,
          },
        };
      }
      const replay = await client.query(
        `SELECT c.request_fingerprint,c.subject_id,p.deleted_at
         FROM control_commands c
         LEFT JOIN data_products p
           ON p.workspace_id=c.workspace_id AND p.id=c.subject_id
         WHERE c.actor_user_id=$1 AND c.workspace_id=$2
           AND c.operation='delete_data_product' AND c.idempotency_key=$3`,
        [input.actorUserId, input.workspaceId, input.idempotencyKey],
      );
      const command = replay.rows[0];
      if (command) {
        if (
          String(command.request_fingerprint) !== input.requestFingerprint ||
          String(command.subject_id) !== input.productId
        ) return {kind: "command_conflict"};
        if (!command.deleted_at) return {kind: "not_found"};
        return {
          kind: "replayed",
          deletion: {
            productId: input.productId,
            deletedAt: timestamp(command.deleted_at)!,
          },
        };
      }
      const current = await client.query(
        "SELECT lock_version,deleted_at FROM data_products WHERE workspace_id=$1 AND id=$2",
        [input.workspaceId, input.productId],
      );
      if (!current.rows[0] || current.rows[0].deleted_at) return {kind: "not_found"};
      return {kind: "precondition_failed"};
    },

    async delivery(workspaceId, productId) {
      const productResult = await client.query(
        `SELECT p.id,p.creator_user_id,
          lv.id AS latest_version_id,lv.version_no AS latest_version_no,
          lv.status AS latest_version_status,lv.output_schema_json AS latest_output_schema
         FROM data_products p
         LEFT JOIN LATERAL (
           SELECT v.id,v.version_no,v.status,v.output_schema_json
           FROM data_product_versions v
           WHERE v.data_product_id=p.id
           ORDER BY v.version_no DESC,v.id DESC LIMIT 1
         ) lv ON true
         WHERE p.workspace_id=$1 AND p.id=$2 AND p.deleted_at IS NULL`,
        [workspaceId, productId],
      );
      const productRow = productResult.rows[0];
      if (!productRow) return null;

      const deploymentResult = await client.query(
        `SELECT d.id AS deployment_id,d.environment AS deployment_environment,
          d.provider AS deployment_provider,d.status AS deployment_status,
          d.endpoint_slug,d.public_base_url,d.active_version_id,
          d.active_materialization_id,d.active_publication_version_id,
          d.last_health_at,d.updated_at AS deployment_updated_at,
          av.id AS active_version_id,av.version_no AS active_version_no,
          av.status AS active_version_status,av.output_schema_json AS active_output_schema,
          m.source_freshness_at,ap.access_mode AS active_access_mode,
          CASE
            WHEN a.storage_kind='inline_json' AND jsonb_typeof(a.payload_json)='array'
            THEN (
              SELECT coalesce(jsonb_agg(sample.value ORDER BY sample.ordinality),'[]'::jsonb)
              FROM jsonb_array_elements(a.payload_json) WITH ORDINALITY AS sample(value,ordinality)
              WHERE sample.ordinality<=3
            )
            ELSE NULL
          END AS sample_rows
         FROM deployments d
         LEFT JOIN data_product_versions av ON av.id=d.active_version_id
         LEFT JOIN materializations m ON m.id=d.active_materialization_id
         LEFT JOIN artifacts a ON a.id=m.artifact_id
         LEFT JOIN publication_versions ap ON ap.id=d.active_publication_version_id
         WHERE d.workspace_id=$1 AND d.data_product_id=$2
         ORDER BY
           CASE d.status WHEN 'healthy' THEN 0 WHEN 'deploying' THEN 1 ELSE 2 END,
           d.updated_at DESC,d.id DESC
         LIMIT 1`,
        [workspaceId, productId],
      );
      const deploymentRow = deploymentResult.rows[0] ?? {};
      const combined = {...productRow, ...deploymentRow};
      const latestVersion = deliveryVersion(combined, "latest");
      const activeVersion = deliveryVersion(combined, "active");
      const selectedDeployment = deliveryDeployment(combined);
      const readiness = apiReadiness(latestVersion, selectedDeployment);
      const contract = deliveryContract(combined, selectedDeployment, activeVersion);

      const publicationResult = selectedDeployment
        ? await client.query(
            `SELECT pv.id AS publication_id,pv.revision_no,
              pv.status AS publication_status,pv.serve_mode,pv.network_id AS publication_network_id,
              pv.asset_id AS publication_asset_id,pv.price_atomic,
              pv.recipient_wallet_address_id,pv.payment_protocol_version,
              pv.payment_scheme,pv.max_timeout_seconds,pv.facilitator,
              pv.facilitator_capability_observed_at,pv.service_fee_enabled,
              pv.created_at AS publication_created_at,
              n.namespace AS network_namespace,n.reference AS network_reference,
              a.asset_identifier,a.symbol AS asset_symbol,a.decimals AS asset_decimals,
              wa.network_account_ref,wa.identity_status,wa.account_completion_status,
              wa.control_status,wa.can_receive AS recipient_can_receive,
              wa.can_spend AS recipient_can_spend,
              cap.can_receive AS capability_can_receive,
              cap.can_spend AS capability_can_spend
             FROM publication_versions pv
             JOIN deployments d ON d.id=pv.deployment_id
             LEFT JOIN networks n ON n.id=pv.network_id
             LEFT JOIN assets a ON a.id=pv.asset_id
             LEFT JOIN wallet_addresses wa ON wa.id=pv.recipient_wallet_address_id
             LEFT JOIN LATERAL (
               SELECT c.can_receive,c.can_spend
               FROM wallet_asset_capabilities c
               WHERE c.wallet_address_id=pv.recipient_wallet_address_id
                 AND c.asset_id=pv.asset_id AND c.status='active'
               ORDER BY c.observed_at DESC,c.id DESC LIMIT 1
             ) cap ON true
             WHERE d.workspace_id=$1 AND d.data_product_id=$2
               AND pv.deployment_id=$3 AND pv.access_mode='x402'
             ORDER BY (pv.id=d.active_publication_version_id) DESC,
               pv.revision_no DESC,pv.id DESC LIMIT 1`,
            [workspaceId, productId, selectedDeployment.id],
          )
        : {rows: []};
      const selectedPublication = publication(
        publicationResult.rows[0],
        `${x402PublicBaseUrl.replace(/\/$/, "")}/${String(productRow.creator_user_id)}/${productId}`,
      );
      const monetizationReadinessValue = monetizationReadiness(readiness, selectedPublication);

      const revenueResult = await client.query(
        `SELECT l.entry_type,l.network_id,n.namespace||':'||n.reference AS network,
          l.asset_id,a.asset_identifier,a.symbol,a.decimals,
          sum(l.amount_atomic)::text AS amount_atomic
         FROM financial_ledger_entries l
         JOIN networks n ON n.id=l.network_id
         JOIN assets a ON a.id=l.asset_id
         WHERE l.workspace_id=$1 AND l.data_product_id=$2
           AND l.recognition_status='confirmed'
           AND l.accounting_view='economic_allocation'
           AND l.entry_type IN ('gross_sale','creator_proceeds','provider_fee')
         GROUP BY l.entry_type,l.network_id,n.namespace,n.reference,
           l.asset_id,a.asset_identifier,a.symbol,a.decimals
         ORDER BY l.entry_type,n.namespace,n.reference,a.symbol`,
        [workspaceId, productId],
      );
      const revenue = (entryType: string) => money(revenueResult.rows
        .filter((row) => row.entry_type === entryType)
        .map((row) => ({
          networkId: row.network_id,
          network: row.network,
          assetId: row.asset_id,
          assetIdentifier: row.asset_identifier,
          symbol: row.symbol,
          decimals: row.decimals,
          amountAtomic: row.amount_atomic,
        })));

      const salesResult = await client.query(
        `SELECT r.id AS request_id,r.correlation_id,r.status AS request_status,
          r.started_at,r.completed_at,
          pi.network_id AS sale_network_id,pi.asset_id AS sale_asset_id,
          pi.amount_atomic AS sale_amount_atomic,
          n.namespace AS sale_network_namespace,n.reference AS sale_network_reference,
          a.asset_identifier AS sale_asset_identifier,a.symbol AS sale_asset_symbol,
          a.decimals AS sale_asset_decimals,
          coalesce(ps.payer_address,pi.payer_address) AS payer_address,
          pa.provider_transaction_ref,ps.network_transaction_id,
          ps.network_transaction_hash,ps.consensus_timestamp
         FROM api_access_requests r
         JOIN deployments d ON d.id=r.deployment_id
         JOIN payment_intents pi ON pi.id=r.payment_intent_id AND pi.kind='api_sale'
         JOIN networks n ON n.id=pi.network_id
         JOIN assets a ON a.id=pi.asset_id
         LEFT JOIN LATERAL (
           SELECT s.* FROM payment_settlements s
           WHERE s.payment_intent_id=pi.id
           ORDER BY s.reported_at DESC,s.id DESC LIMIT 1
         ) ps ON true
         LEFT JOIN LATERAL (
           SELECT p.provider_transaction_ref FROM payment_attempts p
           WHERE p.payment_intent_id=pi.id
           ORDER BY p.attempt_no DESC,p.id DESC LIMIT 1
         ) pa ON true
         WHERE r.workspace_id=$1 AND d.data_product_id=$2
         ORDER BY r.started_at DESC,r.id DESC LIMIT 20`,
        [workspaceId, productId],
      );

      return {
        productId,
        capabilities: {
          deploy: latestVersion?.status === "ready",
          privateRequest: readiness === "available",
          privateExport: latestVersion?.status === "ready",
          publishX402: readiness === "available" && monetizationReadinessValue !== "active",
          publicRequest: readiness === "available" && monetizationReadinessValue === "active",
        },
        api: {
          readiness,
          blockers: apiBlockers(readiness),
          latestVersion,
          activeVersion,
          deployment: selectedDeployment,
          contract,
        },
        monetization: {
          readiness: monetizationReadinessValue,
          blockers: monetizationBlockers(monetizationReadinessValue, selectedPublication),
          publication: selectedPublication,
          revenue: {
            grossSales: revenue("gross_sale"),
            creatorProceeds: revenue("creator_proceeds"),
            providerFees: revenue("provider_fee"),
          },
          sales: salesResult.rows.map(sale),
        },
      } satisfies ProductDeliveryView;
    },

    async overview(workspaceId) {
      const result = await client.query(
        `WITH bounds AS (
          SELECT now() AS ends_at,now()-interval '24 hours' AS starts_at
        ), product_counts AS (
          SELECT count(*) FILTER (WHERE EXISTS (
            SELECT 1
            FROM deployments d
            WHERE d.data_product_id=p.id
              AND (
                d.status='healthy'
                OR EXISTS (
                  SELECT 1
                  FROM publication_versions pv
                  WHERE pv.deployment_id=d.id
                    AND pv.access_mode='x402'
                    AND pv.status='active'
                )
              )
          ))::text AS deployed_count
          FROM data_products p WHERE p.workspace_id=$1 AND p.deleted_at IS NULL
        ), draft_counts AS (
          SELECT count(*)::text AS draft_count
          FROM data_product_versions v
          JOIN data_products p ON p.id=v.data_product_id
          WHERE p.workspace_id=$1 AND p.deleted_at IS NULL
            AND v.status IN ('proposed','validating','invalid','building')
        ), request_counts AS (
          SELECT count(*)::text AS request_count
          FROM api_access_requests r,bounds b
          WHERE r.workspace_id=$1 AND r.started_at>=b.starts_at
            AND r.started_at<b.ends_at
        ), graph_query_counts AS (
          SELECT coalesce(sum(u.quantity),0)::text AS query_count
          FROM usage_events u,bounds b
          WHERE u.workspace_id=$1 AND u.metric='provider_requests'
            AND u.recorded_at>=b.starts_at AND u.recorded_at<b.ends_at
        ), finance AS (
          SELECT l.entry_type,l.network_id,l.asset_id,
            n.namespace||':'||n.reference AS network,a.asset_identifier,
            a.symbol,a.decimals,sum(l.amount_atomic)::text AS amount_atomic
          FROM financial_ledger_entries l
          JOIN networks n ON n.id=l.network_id
          JOIN assets a ON a.id=l.asset_id
          CROSS JOIN bounds b
          WHERE l.workspace_id=$1 AND l.recognition_status='confirmed'
            AND l.accounting_view='economic_allocation'
            AND l.entry_type IN ('graph_expense','gross_sale')
            AND l.occurred_at>=b.starts_at AND l.occurred_at<b.ends_at
          GROUP BY l.entry_type,l.network_id,l.asset_id,n.namespace,n.reference,
            a.asset_identifier,a.symbol,a.decimals
        ), recent AS (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'kind','execution_run','status',r.status,
            'occurredAt',coalesce(r.finished_at,r.started_at,r.queued_at),
            'resource',jsonb_build_object('type','execution_run','id',r.id),
            'summary',r.run_type||' '||r.status
          ) ORDER BY coalesce(r.finished_at,r.started_at,r.queued_at) DESC),'[]'::jsonb) AS items
          FROM (
            SELECT * FROM execution_runs
            WHERE workspace_id=$1
            ORDER BY coalesce(finished_at,started_at,queued_at) DESC,id DESC
            LIMIT 10
          ) r
        )
        SELECT b.starts_at,b.ends_at,p.deployed_count,d.draft_count,
          q.request_count,g.query_count,
          coalesce((SELECT jsonb_agg(jsonb_build_object(
            'networkId',network_id,'network',network,'assetId',asset_id,
            'assetIdentifier',asset_identifier,'symbol',symbol,
            'decimals',decimals,'amountAtomic',amount_atomic
          )) FROM finance WHERE entry_type='graph_expense'),'[]'::jsonb) AS graph_expenses,
          coalesce((SELECT jsonb_agg(jsonb_build_object(
            'networkId',network_id,'network',network,'assetId',asset_id,
            'assetIdentifier',asset_identifier,'symbol',symbol,
            'decimals',decimals,'amountAtomic',amount_atomic
          )) FROM finance WHERE entry_type='gross_sale'),'[]'::jsonb) AS gross_sales,
          recent.items AS recent_activity
        FROM bounds b CROSS JOIN product_counts p CROSS JOIN draft_counts d
        CROSS JOIN request_counts q CROSS JOIN graph_query_counts g CROSS JOIN recent`,
        [workspaceId],
      );
      const row = result.rows[0]!;
      return {
        period: {startsAt: timestamp(row.starts_at)!, endsAt: timestamp(row.ends_at)!},
        deployedProductCount: String(row.deployed_count),
        draftVersionCount: String(row.draft_count),
        apiRequestCount: String(row.request_count),
        graphQueryCount: String(row.query_count),
        graphExpenses: money(row.graph_expenses),
        grossSales: money(row.gross_sales),
        readiness: [],
        recentActivity: Array.isArray(row.recent_activity)
          ? row.recent_activity.map((item) => {
              const activity = item as Record<string, unknown>;
              const resource = activity.resource as Record<string, unknown>;
              return {
                kind: "execution_run" as const,
                status: String(activity.status) as RunStatus,
                occurredAt: timestamp(activity.occurredAt)!,
                resource: {type: "execution_run" as const, id: String(resource.id)},
                summary: String(activity.summary),
              };
            })
          : [],
      } satisfies WorkspaceOverview;
    },
  };
}
