import { identityRoutes } from "../control/identity.routes.js";
import { builderRoutes } from "../control/builder.routes.js";
import { deploymentRoutes } from "../control/deployment.routes.js";
import { paymentRoutes } from "../control/payment.routes.js";
import { evidenceRoutes } from "../control/evidence.routes.js";
import { publicRoutes } from "../products/public.routes.js";
import { dataRoutes } from "../products/data.routes.js";
export const routeCatalog = [
  ...identityRoutes,
  ...builderRoutes,
  ...deploymentRoutes,
  ...paymentRoutes,
  ...evidenceRoutes,
  ...publicRoutes,
  ...dataRoutes,
];
