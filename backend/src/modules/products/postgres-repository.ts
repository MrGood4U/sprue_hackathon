import type {SqlClient} from "../../db/migrations.js";
import type {
  DeploymentSummary,
  Money,
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
  p.id,p.workspace_id,p.account_wallet_id,p.slug,p.name,p.description,
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

function endpointUrl(base: unknown, slug: unknown) {
  if (typeof base !== "string" || !base) return null;
  return `${base.replace(/\/$/, "")}/data/v1/${String(slug)}`;
}

function deployment(row: Record<string, unknown>): DeploymentSummary | null {
  if (!row.deployment_id) return null;
  return {
    id: String(row.deployment_id),
    environment: String(row.deployment_environment) as DeploymentSummary["environment"],
    status: String(row.deployment_status) as DeploymentSummary["status"],
    endpointSlug: String(row.endpoint_slug),
    endpointUrl: endpointUrl(row.public_base_url, row.endpoint_slug),
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

    async overview(workspaceId) {
      const result = await client.query(
        `WITH bounds AS (
          SELECT now() AS ends_at,now()-interval '24 hours' AS starts_at
        ), product_counts AS (
          SELECT count(*) FILTER (WHERE p.status='active')::text AS active_count
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
        SELECT b.starts_at,b.ends_at,p.active_count,d.draft_count,
          q.request_count,
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
        CROSS JOIN request_counts q CROSS JOIN recent`,
        [workspaceId],
      );
      const row = result.rows[0]!;
      return {
        period: {startsAt: timestamp(row.starts_at)!, endsAt: timestamp(row.ends_at)!},
        activeProductCount: String(row.active_count),
        draftVersionCount: String(row.draft_count),
        apiRequestCount: String(row.request_count),
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
