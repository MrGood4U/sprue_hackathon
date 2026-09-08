import type {SqlClient} from "../../db/migrations.js";
import type {
  AgentCommandView,
  AgentMessageView,
  AgentPlanningTraceView,
  AgentRepository,
  AgentSessionView,
} from "./contracts.js";

function timestamp(value: unknown): string | null {
  return value === null || value === undefined ? null : new Date(String(value)).toISOString();
}

function session(row: Record<string, unknown>): AgentSessionView {
  return {
    id: String(row.id),
    productId: row.data_product_id ? String(row.data_product_id) : null,
    title: typeof row.title === "string" ? row.title : null,
    status: String(row.status) as AgentSessionView["status"],
    createdAt: timestamp(row.created_at)!,
    closedAt: timestamp(row.closed_at),
    activeCommandId: row.active_command_id ? String(row.active_command_id) : null,
    traceStreamId: row.trace_stream_id ? String(row.trace_stream_id) : null,
  };
}

function message(row: Record<string, unknown>): AgentMessageView {
  return {
    id: String(row.id),
    sequenceNo: String(row.sequence_no),
    role: String(row.role) as AgentMessageView["role"],
    contentText: typeof row.content_text === "string" ? row.content_text : null,
    contentJson: row.content_json && typeof row.content_json === "object"
      ? row.content_json as AgentMessageView["contentJson"]
      : null,
    redactionStatus: String(row.redaction_status) as AgentMessageView["redactionStatus"],
    modelProvider: typeof row.model_provider === "string" ? row.model_provider : null,
    modelName: typeof row.model_name === "string" ? row.model_name : null,
    createdAt: timestamp(row.created_at)!,
  };
}

const sessionProjection = `s.id,s.data_product_id,s.title,s.status,s.created_at,s.closed_at,
  active.id AS active_command_id,latest.trace_stream_id`;
const sessionJoins = `
  LEFT JOIN LATERAL (
    SELECT c.id FROM planning_checkpoints pc
    JOIN control_commands c ON c.id=pc.control_command_id
    WHERE pc.agent_session_id=s.id AND c.status IN ('queued','running','blocked')
    ORDER BY c.created_at DESC,c.id DESC LIMIT 1
  ) active ON true
  LEFT JOIN LATERAL (
    SELECT c.trace_stream_id FROM planning_checkpoints pc
    JOIN control_commands c ON c.id=pc.control_command_id
    WHERE pc.agent_session_id=s.id
    ORDER BY c.created_at DESC,c.id DESC LIMIT 1
  ) latest ON true`;

async function findSession(
  client: Pick<SqlClient, "query">,
  workspaceId: string,
  sessionId: string,
): Promise<AgentSessionView | null> {
  const result = await client.query(
    `SELECT ${sessionProjection} FROM agent_sessions s ${sessionJoins}
     WHERE s.workspace_id=$1 AND s.id=$2`,
    [workspaceId, sessionId],
  );
  return result.rows[0] ? session(result.rows[0]) : null;
}

function command(row: Record<string, unknown>, sessionId: string): AgentCommandView {
  return {
    commandId: String(row.command_id),
    status: String(row.command_status) as AgentCommandView["status"],
    subject: {type: "agent_session", id: sessionId},
    traceStreamId: String(row.trace_stream_id),
    pollAfterMs: 0,
  };
}

function traceEvent(row: Record<string, unknown>): AgentPlanningTraceView["items"][number] {
  return {
    sequenceNo: Number(row.sequence_no),
    stage: String(row.stage) as AgentPlanningTraceView["items"][number]["stage"],
    status: String(row.status) === "succeeded" ? "passed" : String(row.status) as "started" | "failed",
    summary: String(row.summary),
    createdAt: timestamp(row.created_at)!,
  };
}

export function postgresAgentRepository(client: Pick<SqlClient, "query">): AgentRepository {
  return {
    async createSession(input) {
      const result = await client.query(
        `WITH eligible AS MATERIALIZED (
          SELECT $4::uuid AS product_id
          WHERE $4::uuid IS NULL OR EXISTS (
            SELECT 1 FROM data_products
            WHERE workspace_id=$2 AND id=$4::uuid AND deleted_at IS NULL
          )
        ), accepted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,finished_at
          )
          SELECT $3,$2,'create_agent_session',$6,$7,$8,'succeeded',
            'not_supported',false,'agent_session',$1,now()
          FROM eligible
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING subject_id
        )
        INSERT INTO agent_sessions (
          id,workspace_id,created_by_user_id,data_product_id,title,status
        )
        SELECT $1,$2,$3,eligible.product_id,$5,'active'
        FROM accepted,eligible
        RETURNING id`,
        [
          input.id,
          input.workspaceId,
          input.actorUserId,
          input.productId,
          input.title,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
        ],
      );
      if (result.rows[0]) {
        return {kind: "created", session: (await findSession(client, input.workspaceId, input.id))!};
      }
      const replay = await client.query(
        `SELECT request_fingerprint,subject_id FROM control_commands
         WHERE actor_user_id=$1 AND workspace_id=$2
           AND operation='create_agent_session' AND idempotency_key=$3`,
        [input.actorUserId, input.workspaceId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (String(replay.rows[0].request_fingerprint) !== input.requestFingerprint) {
          return {kind: "command_conflict"};
        }
        const value = await findSession(client, input.workspaceId, String(replay.rows[0].subject_id));
        return value ? {kind: "replayed", session: value} : {kind: "not_found"};
      }
      return {kind: "not_found"};
    },

    async listSessions(workspaceId, productId) {
      const result = await client.query(
        `SELECT ${sessionProjection} FROM agent_sessions s ${sessionJoins}
         WHERE s.workspace_id=$1 AND ($2::uuid IS NULL OR s.data_product_id=$2::uuid)
         ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,
        [workspaceId, productId ?? null],
      );
      return result.rows.map(session);
    },

    findSession: (workspaceId, sessionId) => findSession(client, workspaceId, sessionId),

    async listMessages(workspaceId, sessionId, afterSequence, limit) {
      const result = await client.query(
        `SELECT m.id,m.sequence_no,m.role,m.content_text,m.content_json,
          m.redaction_status,m.model_provider,m.model_name,m.created_at
         FROM agent_messages m
         JOIN agent_sessions s ON s.id=m.agent_session_id
         WHERE s.workspace_id=$1 AND s.id=$2 AND m.sequence_no>$3
         ORDER BY m.sequence_no,m.id LIMIT $4`,
        [workspaceId, sessionId, afterSequence, limit + 1],
      );
      return {items: result.rows.slice(0, limit).map(message), hasMore: result.rows.length > limit};
    },

    async beginPlanning(input) {
      const result = await client.query(
        `WITH existing AS MATERIALIZED (
          SELECT 1 FROM control_commands c
          WHERE c.actor_user_id=$3 AND c.workspace_id=$1
            AND c.operation='plan_agent_message' AND c.idempotency_key=$7
        ), target AS MATERIALIZED (
          SELECT s.id,s.data_product_id FROM agent_sessions s
          WHERE s.workspace_id=$1 AND s.id=$2 AND s.status='active'
          FOR UPDATE
        ), eligible AS MATERIALIZED (
          SELECT target.* FROM target
          WHERE NOT EXISTS (SELECT 1 FROM existing)
          AND (
            target.data_product_id IS NULL OR EXISTS (
              SELECT 1 FROM data_products p
              WHERE p.workspace_id=$1 AND p.id=target.data_product_id
                AND p.deleted_at IS NULL
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM planning_checkpoints pc
            JOIN control_commands c ON c.id=pc.control_command_id
            WHERE pc.agent_session_id=target.id
              AND c.status IN ('queued','running','blocked')
          )
        ), trace AS (
          INSERT INTO trace_streams (
            id,workspace_id,stream_kind,data_product_id,agent_session_id,status
          )
          SELECT $5,$1,'planning',eligible.data_product_id,$2,'open' FROM eligible
          RETURNING id
        ), accepted AS (
          INSERT INTO control_commands (
            id,actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id,trace_stream_id
          )
          SELECT $4,$3,$1,'plan_agent_message',$7,$8,$9,'running',
            'available',false,'agent_session',$2,trace.id
          FROM trace
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id,status,trace_stream_id
        ), checkpoint AS (
          INSERT INTO planning_checkpoints (
            control_command_id,agent_session_id,phase,registry_hash,
            prompt_version,compiler_version,model_call_limit,tool_call_limit,
            repair_limit,input_token_limit,output_token_limit,cost_limit_atomic,
            cost_unit,deadline_at
          )
          SELECT id,$2,'P1','sha256:agent-harness-registry-v1','1',
            'agent-harness-1',4,1,1,100000,30000,0,'usd_micro',
            $12
          FROM accepted
          RETURNING control_command_id
        ), initialized_product AS (
          UPDATE data_products p SET
            original_intent=$10,lock_version=lock_version+1,updated_at=now()
          FROM eligible
          WHERE p.workspace_id=$1 AND p.id=eligible.data_product_id
            AND p.original_intent='' AND p.deleted_at IS NULL
          RETURNING p.id
        ), user_message AS (
          INSERT INTO agent_messages (
            id,agent_session_id,sequence_no,role,content_text,content_json,
            content_hash,redaction_status
          )
          SELECT $6,$2,
            coalesce((SELECT max(sequence_no) FROM agent_messages WHERE agent_session_id=$2),0)+1,
            'user',$10,NULL,$11,'none'
          FROM checkpoint
          WHERE (SELECT count(*) FROM initialized_product)>=0
          RETURNING id
        )
        SELECT accepted.id AS command_id,accepted.status AS command_status,
          accepted.trace_stream_id,user_message.id AS user_message_id
        FROM accepted,user_message`,
        [
          input.workspaceId,
          input.sessionId,
          input.actorUserId,
          input.commandId,
          input.traceStreamId,
          input.userMessageId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
          input.contentText,
          input.contentHash,
          input.deadlineAt,
        ],
      );
      if (result.rows[0]) {
        return {
          kind: "started",
          planning: {
            commandId: String(result.rows[0].command_id),
            traceStreamId: String(result.rows[0].trace_stream_id),
            userMessageId: String(result.rows[0].user_message_id),
            status: String(result.rows[0].command_status) as AgentCommandView["status"],
            replayed: false,
          },
        };
      }
      const replay = await client.query(
        `SELECT c.id AS command_id,c.status AS command_status,c.trace_stream_id,
          (SELECT m.id FROM agent_messages m
           WHERE m.agent_session_id=pc.agent_session_id AND m.role='user'
           ORDER BY m.sequence_no DESC LIMIT 1) AS user_message_id,
          c.request_fingerprint
         FROM control_commands c
         JOIN planning_checkpoints pc ON pc.control_command_id=c.id
         WHERE c.actor_user_id=$1 AND c.workspace_id=$2
           AND c.operation='plan_agent_message' AND c.idempotency_key=$3`,
        [input.actorUserId, input.workspaceId, input.idempotencyKey],
      );
      if (replay.rows[0]) {
        if (String(replay.rows[0].request_fingerprint) !== input.requestFingerprint) {
          return {kind: "command_conflict"};
        }
        return {
          kind: "replayed",
          planning: {
            commandId: String(replay.rows[0].command_id),
            traceStreamId: String(replay.rows[0].trace_stream_id),
            userMessageId: String(replay.rows[0].user_message_id),
            status: String(replay.rows[0].command_status) as AgentCommandView["status"],
            replayed: true,
          },
        };
      }
      const current = await findSession(client, input.workspaceId, input.sessionId);
      if (!current) return {kind: "not_found"};
      return current.activeCommandId ? {kind: "in_progress"} : {kind: "command_conflict"};
    },

    async appendPlanningTrace(workspaceId, sessionId, commandId, event) {
      const result = await client.query(
        `INSERT INTO trace_events (
          trace_stream_id,sequence_no,stage,event_type,status,summary,details_json
        )
        SELECT c.trace_stream_id,$4,$5,$6,$7,$8,NULL
        FROM control_commands c
        JOIN planning_checkpoints pc ON pc.control_command_id=c.id
        JOIN agent_sessions s ON s.id=pc.agent_session_id
        JOIN trace_streams ts ON ts.id=c.trace_stream_id
        WHERE c.workspace_id=$1 AND s.id=$2 AND c.id=$3
          AND c.status='running' AND ts.status='open'
        ON CONFLICT (trace_stream_id,sequence_no) DO NOTHING
        RETURNING id`,
        [
          workspaceId,
          sessionId,
          commandId,
          event.sequenceNo,
          event.stage,
          event.status === "started" ? "stage_started" : event.status === "failed" ? "stage_failed" : "stage_completed",
          event.status === "passed" ? "succeeded" : event.status,
          event.summary,
        ],
      );
      if (!result.rows[0]) {
        const existing = await client.query(
          `SELECT 1 FROM trace_events te
           JOIN control_commands c ON c.trace_stream_id=te.trace_stream_id
           JOIN planning_checkpoints pc ON pc.control_command_id=c.id
           JOIN agent_sessions s ON s.id=pc.agent_session_id
           WHERE c.workspace_id=$1 AND s.id=$2 AND c.id=$3 AND te.sequence_no=$4`,
          [workspaceId, sessionId, commandId, event.sequenceNo],
        );
        if (!existing.rows[0]) throw new Error("AGENT_TRACE_APPEND_FAILED");
      }
    },

    async listActivePlanningTrace(workspaceId, sessionId, afterSequence, limit) {
      if (!await findSession(client, workspaceId, sessionId)) {
        return null;
      }
      const stream = await client.query(
        `SELECT ts.id,ts.status,c.id AS command_id FROM trace_streams ts
         JOIN control_commands c ON c.trace_stream_id=ts.id
         WHERE ts.workspace_id=$1 AND ts.agent_session_id=$2
           AND ts.stream_kind='planning' AND ts.status='open'
           AND c.status='running'
         ORDER BY ts.created_at DESC,ts.id DESC LIMIT 1`,
        [workspaceId, sessionId],
      );
      if (!stream.rows[0]) {
        return {commandId: null, traceStreamId: null, streamStatus: null, items: [], hasMore: false};
      }
      const traceStreamId = String(stream.rows[0].id);
      const events = await client.query(
        `SELECT sequence_no,stage,status,summary,created_at
         FROM trace_events
         WHERE trace_stream_id=$1 AND sequence_no>$2
         ORDER BY sequence_no,id LIMIT $3`,
        [traceStreamId, afterSequence, limit + 1],
      );
      return {
        commandId: String(stream.rows[0].command_id),
        traceStreamId,
        streamStatus: "open",
        items: events.rows.slice(0, limit).map(traceEvent),
        hasMore: events.rows.length > limit,
      };
    },

    async requestPlanningCancellation(workspaceId, sessionId, commandId) {
      const result = await client.query(
        `UPDATE control_commands c SET cancellation='requested',updated_at=now()
         FROM planning_checkpoints pc
         JOIN agent_sessions s ON s.id=pc.agent_session_id
         WHERE c.id=$3 AND c.workspace_id=$1 AND c.operation='plan_agent_message'
           AND c.subject_type='agent_session' AND c.subject_id=$2
           AND pc.control_command_id=c.id AND s.workspace_id=$1 AND s.id=$2
           AND c.status='running' AND c.cancellation IN ('available','requested')
         RETURNING c.id AS command_id,c.status AS command_status,c.trace_stream_id`,
        [workspaceId, sessionId, commandId],
      );
      return result.rows[0] ? command(result.rows[0], sessionId) : null;
    },

    async completePlanning(workspaceId, sessionId, commandId, assistantMessageId, contentHash, completion) {
      const events = completion.trace.map((event) => ({
        sequence_no: event.sequenceNo,
        stage: event.stage,
        event_type: event.status === "started" ? "stage_started" : event.status === "failed" ? "stage_failed" : "stage_completed",
        status: event.status === "passed" ? "succeeded" : event.status,
        summary: event.summary,
      }));
      const result = await client.query(
        `WITH target AS MATERIALIZED (
          SELECT c.id,c.trace_stream_id FROM control_commands c
          JOIN planning_checkpoints pc ON pc.control_command_id=c.id
          JOIN agent_sessions s ON s.id=pc.agent_session_id
          WHERE c.workspace_id=$1 AND s.id=$2 AND c.id=$3 AND c.status='running'
          FOR UPDATE
        ), assistant_message AS (
          INSERT INTO agent_messages (
            id,agent_session_id,sequence_no,role,content_text,content_json,
            content_hash,redaction_status,model_provider,model_name
          )
          SELECT $4,$2,
            coalesce((SELECT max(sequence_no) FROM agent_messages WHERE agent_session_id=$2),0)+1,
            'assistant',$5,$6::jsonb,$7,'none',$8,$9
          FROM target
          RETURNING id
        ), inserted_events AS (
          INSERT INTO trace_events (
            trace_stream_id,sequence_no,stage,event_type,status,summary,details_json
          )
          SELECT target.trace_stream_id,event.sequence_no,event.stage,
            event.event_type,event.status,event.summary,NULL
          FROM target,jsonb_to_recordset($10::jsonb) AS event(
            sequence_no integer,stage text,event_type text,status text,summary text
          )
          ON CONFLICT (trace_stream_id,sequence_no) DO NOTHING
          RETURNING id
        ), updated_checkpoint AS (
          UPDATE planning_checkpoints SET phase='P7',revision_no=revision_no+1,updated_at=now()
          WHERE control_command_id=(SELECT id FROM target)
            AND (SELECT count(*) FROM inserted_events)>=0
          RETURNING control_command_id
        ), updated_stream AS (
          UPDATE trace_streams SET status=$11,closed_at=now()
          WHERE id=(SELECT trace_stream_id FROM target)
            AND EXISTS (SELECT 1 FROM updated_checkpoint)
          RETURNING id
        ), updated_command AS (
          UPDATE control_commands SET status=$12,error_code=$13,
            cancellation=CASE WHEN $12='cancelled' THEN 'completed' ELSE cancellation END,
            updated_at=now(),finished_at=now()
          WHERE id=(SELECT id FROM target)
            AND EXISTS (SELECT 1 FROM assistant_message)
            AND EXISTS (SELECT 1 FROM updated_stream)
          RETURNING id,status,trace_stream_id
        )
        SELECT id AS command_id,status AS command_status,trace_stream_id
        FROM updated_command`,
        [
          workspaceId,
          sessionId,
          commandId,
          assistantMessageId,
          completion.contentText,
          JSON.stringify(completion.contentJson),
          contentHash,
          completion.modelProvider,
          completion.modelName,
          JSON.stringify(events),
          completion.status === "failed" ? "failed" : "completed",
          completion.status,
          completion.errorCode,
        ],
      );
      if (!result.rows[0]) throw new Error("AGENT_PLANNING_COMPLETION_FAILED");
      return command(result.rows[0], sessionId);
    },
  };
}
