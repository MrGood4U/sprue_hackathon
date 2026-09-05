// Database-first column mapping. SQL migrations own foreign keys, indexes and triggers.
// Never use schema push to replace the reviewed migrations.
import { pgTable, uuid, text, integer, smallint, bigint, numeric, timestamp, boolean, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const networks = pgTable("networks", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  namespace: text("namespace").notNull(),
  reference: text("reference").notNull(),
  environment: text("environment").notNull(),
  name: text("name").notNull(),
  explorer_base_url: text("explorer_base_url"),
  status: text("status").notNull(),
});

export const assets = pgTable("assets", {
  id: uuid("id").notNull().primaryKey().defaultRandom(),
  network_id: uuid("network_id").notNull(),
  standard: text("standard").notNull(),
  asset_type: text("asset_type").notNull(),
  asset_identifier: text("asset_identifier").notNull(),
  symbol: text("symbol").notNull(),
  decimals: smallint("decimals").notNull(),
  status: text("status").notNull(),
});
