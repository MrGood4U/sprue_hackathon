import { bootstrapSchema } from "../identity/contracts.js";
import type { AuthRepository } from "./ports.js";

export interface AuthTransaction {
  query(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}

export type AuthConnectionFactory = () => Promise<AuthTransaction>;

export function postgresAuthRepository(
  connect: AuthConnectionFactory,
): AuthRepository {
  return {
    async bootstrap(identity) {
      const client = await connect();
      let transactionOpen = false;
      try {
        await client.query("BEGIN");
        transactionOpen = true;
        const bindingKey = `${identity.provider}:${identity.subject}`;
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [bindingKey],
        );
        let { rows: userRows } = await client.query(
          `SELECT u.id,u.display_name,u.status,ai.status AS identity_status
          FROM auth_identities ai
          JOIN users u ON u.id=ai.user_id
          WHERE ai.provider=$1 AND ai.provider_subject=$2
          FOR UPDATE OF ai,u`,
          [identity.provider, identity.subject],
        );
        let user = userRows[0];
        if (user?.identity_status === "revoked") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return { kind: "identity_revoked" };
        }
        if (!user) {
          const created = await client.query(
            `INSERT INTO users(status,last_seen_at)
            VALUES ('active',now())
            RETURNING id,display_name,status`,
          );
          user = created.rows[0];
          if (!user) throw new Error("AUTH_BOOTSTRAP_USER_MISSING");
          await client.query(
            `INSERT INTO auth_identities(user_id,provider,provider_subject,status,last_seen_at)
            VALUES ($1,$2,$3,'active',now())`,
            [user.id, identity.provider, identity.subject],
          );
        } else {
          await client.query(
            `UPDATE auth_identities SET last_seen_at=now()
            WHERE provider=$1 AND provider_subject=$2`,
            [identity.provider, identity.subject],
          );
          await client.query("UPDATE users SET last_seen_at=now() WHERE id=$1", [
            user.id,
          ]);
        }
        if (user.status !== "active") {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return {
            kind: "blocked",
            userStatus: String(user.status) as "suspended" | "closed",
          };
        }

        let { rows: workspaces } = await client.query(
          `SELECT w.id,w.slug,w.name,w.status,w.lock_version
          FROM workspaces w
          JOIN workspace_members m ON m.workspace_id=w.id
          WHERE w.owner_user_id=$1 AND m.user_id=$1
            AND m.role='owner' AND m.status='active'
          ORDER BY w.created_at,w.id`,
          [user.id],
        );
        if (!workspaces.length) {
          const slug = `workspace-${String(user.id).replaceAll("-", "").slice(0, 12)}`;
          const { rows } = await client.query(
            `INSERT INTO workspaces(owner_user_id,slug,name,status)
            VALUES ($1,$2,'My workspace','active')
            RETURNING id,slug,name,status,lock_version`,
            [user.id, slug],
          );
          const workspace = rows[0];
          if (!workspace) throw new Error("AUTH_BOOTSTRAP_WORKSPACE_MISSING");
          await client.query(
            `INSERT INTO workspace_members(workspace_id,user_id,role,status)
            VALUES ($1,$2,'owner','active')`,
            [workspace.id, user.id],
          );
          workspaces = [workspace];
        }

        const bootstrap = bootstrapSchema.parse({
          user: {
            id: user.id,
            displayName: user.display_name,
            status: user.status,
          },
          workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            slug: workspace.slug,
            name: workspace.name,
            status: workspace.status,
            role: "owner",
            lockVersion: workspace.lock_version,
          })),
          defaultWorkspaceId: workspaces[0]!.id,
        });
        await client.query("COMMIT");
        transactionOpen = false;
        return { kind: "ready", bootstrap };
      } catch (error) {
        if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
