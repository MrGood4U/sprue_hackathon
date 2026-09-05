import { withDatabase, reportDatabaseError } from "../src/db/client.js";
import { seedReferenceData } from "../src/db/seed.js";
try { console.log(JSON.stringify(await withDatabase(seedReferenceData), null, 2)); }
catch (error) { reportDatabaseError(error); }
