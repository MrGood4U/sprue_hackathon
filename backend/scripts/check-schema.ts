import { withDatabase, reportDatabaseError } from "../src/db/client.js";
import { checkSchema } from "../src/db/check-schema.js";
try { console.log(JSON.stringify(await withDatabase(checkSchema), null, 2)); }
catch (error) { reportDatabaseError(error); }
