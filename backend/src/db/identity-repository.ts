import type { SqlClient } from "./migrations.js";
import type { IdentityRepository } from "../modules/identity/ports.js";
import { bootstrapSchema } from "../modules/identity/contracts.js";
export function identityRepository(
  client: Pick<SqlClient, "query">,
): IdentityRepository {
  return {
    async findBootstrap(identity) {
      // One statement gives a consistent user/owner projection; no SELECT * crosses HTTP.
      const { rows } = await client.query(
        `SELECT u.id, u.display_name, u.status,
        coalesce(jsonb_agg(jsonb_build_object('id',w.id,'slug',w.slug,'name',w.name,'status',w.status,'role','owner','lockVersion',w.lock_version) ORDER BY w.created_at,w.id) FILTER (WHERE w.id IS NOT NULL),'[]'::jsonb) AS workspaces
        FROM auth_identities ai JOIN users u ON u.id=ai.user_id
        LEFT JOIN workspace_members m ON m.user_id=u.id AND m.role='owner' AND m.status='active'
        LEFT JOIN workspaces w ON w.id=m.workspace_id AND w.owner_user_id=u.id
        WHERE ai.provider=$1 AND ai.provider_subject=$2 AND ai.status='active'
        GROUP BY u.id`,
        [identity.provider, identity.subject],
      );
      const row = rows[0];
      if (!row || !Array.isArray(row.workspaces) || !row.workspaces.length)
        return null;
      return bootstrapSchema.parse({
        user: { id: row.id, displayName: row.display_name, status: row.status },
        workspaces: row.workspaces,
        defaultWorkspaceId: row.workspaces[0].id,
      });
    },
    async findOwnedWorkspace(identity, workspaceId) {
      const { rows } = await client.query(
        `SELECT u.status AS user_status,w.status AS workspace_status
        FROM auth_identities ai JOIN users u ON u.id=ai.user_id
        JOIN workspace_members m ON m.user_id=u.id AND m.role='owner' AND m.status='active'
        JOIN workspaces w ON w.id=m.workspace_id AND w.owner_user_id=u.id
        WHERE ai.provider=$1 AND ai.provider_subject=$2 AND ai.status='active' AND w.id=$3`,
        [identity.provider, identity.subject, workspaceId],
      );
      return rows[0]
        ? {
            userStatus: String(rows[0].user_status),
            workspaceStatus: String(rows[0].workspace_status),
          }
        : null;
    },
  };
}
