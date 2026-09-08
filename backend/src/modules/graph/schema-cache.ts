import {createClient} from "redis";
import {z} from "zod";
import type {GraphCachedSchemaProjection, GraphSchemaCachePort} from "./types.js";

interface RedisSchemaClient {
  readonly isOpen: boolean;
  on(event: "error", listener: (error: unknown) => void): unknown;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

const identifier = z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9:._-]+$/);
const schemaHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const inspectedField = z.object({
  path: z.string().min(1).max(500),
  graphType: z.string().min(1).max(200),
  valueType: z.enum(["boolean", "string", "id", "address", "bytes", "integer", "decimal", "timestamp", "date", "json"]),
  nullable: z.boolean(),
  list: z.boolean(),
}).strict();
const cachedProjection = z.object({
  schemaVersion: z.literal(1),
  gatewayEnvironment: z.literal("mainnet"),
  manifestIpfsCid: identifier,
  schemaHash,
  schemaBytes: z.number().int().positive().max(5_242_880),
  queryEntitySource: z.enum(["source_sdl", "runtime_introspection"]),
  entities: z.array(z.object({
    queryEntity: z.string().min(1).max(200),
    entityType: z.string().min(1).max(200),
    fields: z.array(inspectedField).max(256),
  }).strict()).max(128),
}).strict();

export class GraphSchemaCacheError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "GraphSchemaCacheError";
  }
}

function cacheKey(identity: {manifestIpfsCid: string; schemaHash: string}): string {
  const cid = identifier.parse(identity.manifestIpfsCid);
  const hash = schemaHash.parse(identity.schemaHash).slice("sha256:".length);
  return `sprue:graph-schema:v1:mainnet:${cid}:${hash}`;
}

/**
 * Process-local implementation for deterministic tests. Production composes
 * RedisGraphSchemaCache so the same immutable projection is reused by every
 * authenticated workspace and API process.
 */
export class MemoryGraphSchemaCache implements GraphSchemaCachePort {
  private readonly values = new Map<string, GraphCachedSchemaProjection>();

  async get(identity: {manifestIpfsCid: string; schemaHash: string}): Promise<GraphCachedSchemaProjection | null> {
    return this.values.get(cacheKey(identity)) ?? null;
  }

  async set(value: GraphCachedSchemaProjection): Promise<void> {
    const validated = cachedProjection.parse(value) as GraphCachedSchemaProjection;
    this.values.set(cacheKey(validated), validated);
  }
}

/**
 * Explicit no-cache implementation used when GRAPH_SCHEMA_CACHE_ENABLED=false.
 * A miss is returned for every read and writes are discarded, so discovery
 * re-fetches and re-verifies schema evidence for every planning request.
 */
export class DisabledGraphSchemaCache implements GraphSchemaCachePort {
  async get(): Promise<null> {
    return null;
  }

  async set(): Promise<void> {}

  async close(): Promise<void> {}
}

export class RedisGraphSchemaCache implements GraphSchemaCachePort {
  private readonly client: RedisSchemaClient;
  private connection: Promise<void> | null = null;

  constructor(url: string) {
    this.client = createClient({
      url,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: false,
      },
    }) as unknown as RedisSchemaClient;
    // node-redis requires an error listener. Cache failures remain explicit at
    // the call site and this listener deliberately records no URL or payload.
    this.client.on("error", () => undefined);
  }

  private async connect(): Promise<void> {
    if (this.client.isOpen) return;
    this.connection ??= this.client.connect().then(() => undefined).catch(() => {
      this.connection = null;
      throw new GraphSchemaCacheError("GRAPH_SCHEMA_CACHE_UNAVAILABLE");
    });
    await this.connection;
  }

  async get(
    identity: {manifestIpfsCid: string; schemaHash: string},
    signal?: AbortSignal,
  ): Promise<GraphCachedSchemaProjection | null> {
    if (signal?.aborted) throw signal.reason;
    await this.connect();
    try {
      const raw = await this.client.get(cacheKey(identity));
      if (raw === null) return null;
      const parsed = cachedProjection.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new GraphSchemaCacheError("GRAPH_SCHEMA_CACHE_INVALID");
      if (parsed.data.manifestIpfsCid !== identity.manifestIpfsCid || parsed.data.schemaHash !== identity.schemaHash) {
        throw new GraphSchemaCacheError("GRAPH_SCHEMA_CACHE_INVALID");
      }
      return parsed.data as GraphCachedSchemaProjection;
    } catch (error) {
      if (error instanceof GraphSchemaCacheError) throw error;
      throw new GraphSchemaCacheError("GRAPH_SCHEMA_CACHE_UNAVAILABLE");
    }
  }

  async set(value: GraphCachedSchemaProjection, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw signal.reason;
    const validated = cachedProjection.parse(value) as GraphCachedSchemaProjection;
    await this.connect();
    try {
      await this.client.set(cacheKey(validated), JSON.stringify(validated));
    } catch {
      throw new GraphSchemaCacheError("GRAPH_SCHEMA_CACHE_UNAVAILABLE");
    }
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
    this.connection = null;
  }
}
