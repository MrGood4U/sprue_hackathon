import { z } from "zod";
export const bootstrapSchema = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    displayName: z.string().nullable(),
    status: z.enum(["active", "suspended", "closed"]),
  }),
  workspaces: z.array(
    z.strictObject({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      status: z.enum(["active", "suspended", "archived"]),
      role: z.literal("owner"),
      lockVersion: z.number().int().nonnegative(),
    }),
  ),
  defaultWorkspaceId: z.uuid(),
});
export type Bootstrap = z.infer<typeof bootstrapSchema>;
