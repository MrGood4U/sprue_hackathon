import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.js";
import type { SqlClient } from "./migrations.js";

export async function checkSchema(client: SqlClient) {
  const actual = (await client.query("SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid,a.atttypmod) AS sql_type, a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND c.relname <> 'sprue_migrations' ORDER BY c.relname, a.attnum")).rows;
  const expected = Object.values(schema).flatMap((table) => {
    const config = getTableConfig(table);
    return config.columns.map((column) => ({ table_name: config.name, column_name: column.name, sql_type: column.getSQLType().replace(/\s+/g," "), not_null: column.notNull }));
  });
  const signature = (row: Record<string, unknown>) => `${row.table_name}.${row.column_name}:${String(row.sql_type).replace(/\s/g,"")}:${row.not_null}`;
  const actualSet = new Set(actual.map(signature));
  const expectedSet = new Set(expected.map(signature));
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const unexpected = [...actualSet].filter((item) => !expectedSet.has(item));
  if (missing.length || unexpected.length) throw new Error(`SCHEMA_MISMATCH ${JSON.stringify({ missing, unexpected })}`);
  return { tables: Object.keys(schema).length, columns: expected.length };
}
