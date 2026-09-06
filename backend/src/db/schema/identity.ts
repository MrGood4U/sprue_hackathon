// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  display_name: text("display_name"),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
});

export const authIdentities = pgTable("auth_identities", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull(),
  provider: text("provider").notNull(),
  provider_subject: text("provider_subject").notNull(),
  status: text("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true, mode: "date" }),
  revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  owner_user_id: uuid("owner_user_id").notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});

export const workspace_members = pgTable("workspace_members", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  user_id: uuid("user_id").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  created_at: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  revoked_at: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});
