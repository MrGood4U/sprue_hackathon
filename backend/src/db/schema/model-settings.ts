// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import {pgTable, uuid, text, integer, timestamp, customType} from "drizzle-orm/pg-core";

const bytea = customType<{data: Buffer}>({
  dataType() {
    return "bytea";
  },
});

export const agent_model_profiles = pgTable("agent_model_profiles", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull(),
  created_by_user_id: uuid("created_by_user_id").notNull(),
  updated_by_user_id: uuid("updated_by_user_id").notNull(),
  protocol: text("protocol").notNull(),
  api_url: text("api_url").notNull(),
  model_name: text("model_name").notNull(),
  api_key_ciphertext: bytea("api_key_ciphertext").notNull(),
  encryption_key_id: text("encryption_key_id").notNull(),
  encryption_iv: bytea("encryption_iv").notNull(),
  encryption_auth_tag: bytea("encryption_auth_tag").notNull(),
  secret_version: integer("secret_version").notNull(),
  credential_fingerprint: text("credential_fingerprint").notNull(),
  created_at: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull().defaultNow(),
  updated_at: timestamp("updated_at", {withTimezone: true, mode: "date"}).notNull().defaultNow(),
  lock_version: integer("lock_version").notNull().default(0),
});
