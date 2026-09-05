import { withDatabase, reportDatabaseError } from "../src/db/client.js";
import { migrate, migrationStatus, readMigrations } from "../src/db/migrations.js";

try {
  if (process.argv.slice(2).some((arg) => arg !== "--status")) throw new Error("UNKNOWN_MIGRATION_ARGUMENT");
  const migrations = await readMigrations();
  const result = await withDatabase((client) => process.argv.includes("--status") ? migrationStatus(client, migrations) : migrate(client, migrations));
  console.log(JSON.stringify(result, null, 2));
} catch (error) { reportDatabaseError(error); }
