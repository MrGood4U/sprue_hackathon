import { backendServices } from "./api/demo-runtime.js";

// Business data comes from the backend demo boundary. The backend owns the
// temporary fixture and mock Agent while the frontend owns no product data.
export const frontendServices = backendServices;
export { getPublicAppConfig } from "./api/public-config.js";
