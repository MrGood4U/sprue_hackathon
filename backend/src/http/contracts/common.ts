import { z } from "zod";
export const idSchema = z.uuid();
export const atomicSchema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/);
export const emptyObjectSchema = z.strictObject({});
export const featureSchema = z.strictObject({
  graphCustomerApiKey: z.literal(false),
  graphX402: z.literal(false),
  hederaPublication: z.literal(false),
  hostedDemoConsumer: z.boolean(),
  serviceFees: z.literal(false),
  liveGraphExecution: z.literal(false),
});
export const appConfigSchema = z.strictObject({
  apiVersion: z.literal("1"),
  environment: z.enum(["local", "demo", "self_hosted"]),
  privyAppId: z.string().nullable(),
  consolePublicUrl: z.url(),
  dataPublicBaseUrl: z.url(),
  demoProductUrl: z.string().nullable(),
  features: featureSchema,
});
export {
  bootstrapSchema,
  type Bootstrap,
} from "../../modules/identity/contracts.js";
export const metaSchema = z.strictObject({
  requestId: z.string(),
  apiVersion: z.literal("1"),
  dataSource: z.enum(["live", "demo"]),
  observedAt: z.iso.datetime(),
});
export const errorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    retryAction: z.string(),
    fields: z.array(z.unknown()),
    blockers: z.array(z.unknown()),
  }),
  meta: metaSchema,
});
export function meta(requestId: string, dataSource: "live" | "demo" = "live") {
  return {
    requestId,
    apiVersion: "1" as const,
    dataSource,
    observedAt: new Date().toISOString(),
  };
}
