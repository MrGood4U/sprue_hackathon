import {z} from "zod";
import type {X402PaymentRequirements} from "../deployments/contracts.js";

const supportedSchema = z.strictObject({
  kinds: z.array(z.object({
    x402Version: z.literal(2),
    scheme: z.literal("exact"),
    network: z.string(),
    extra: z.object({feePayer: z.string().min(1).max(128)}).optional(),
  }).passthrough()).max(100),
  extensions: z.array(z.unknown()).optional(),
  signers: z.record(z.string(), z.array(z.string())).optional(),
}).passthrough();

const verifySchema = z.object({
  isValid: z.boolean(),
  payer: z.string().min(1).max(256).optional(),
  invalidReason: z.string().max(256).optional(),
  invalidMessage: z.string().max(1024).optional(),
}).passthrough();

const settleSchema = z.object({
  success: z.boolean(),
  transaction: z.string().max(512).optional(),
  network: z.string().max(128).optional(),
  payer: z.string().max(256).optional(),
  errorReason: z.string().max(256).optional(),
  errorMessage: z.string().max(1024).optional(),
}).passthrough();

export interface X402PaymentPayload {
  x402Version: 2;
  accepted: X402PaymentRequirements;
  payload: {transaction: string};
  resource?: {url: string; description?: string; mimeType?: string};
  extensions?: Record<string, unknown>;
}

export interface X402Facilitator {
  readonly publicUrl: string;
  supported(signal?: AbortSignal): Promise<{capability: Record<string, unknown>; feePayer: string}>;
  verify(payload: X402PaymentPayload, requirements: X402PaymentRequirements, signal?: AbortSignal): Promise<{valid: boolean; payer: string | null; reason: string | null; evidence: Record<string, unknown>}>;
  settle(payload: X402PaymentPayload, requirements: X402PaymentRequirements, signal?: AbortSignal): Promise<{success: boolean; payer: string | null; transaction: string | null; reason: string | null; evidence: Record<string, unknown>}>;
}

export class Blocky402Error extends Error {
  constructor(readonly code: "BLOCKY402_UNAVAILABLE" | "BLOCKY402_INVALID_RESPONSE") {
    super(code);
    this.name = "Blocky402Error";
  }
}

function requestSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(15_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class Blocky402Client implements X402Facilitator {
  readonly publicUrl: string;

  constructor(baseUrl: string, private readonly fetchImpl: typeof fetch = globalThis.fetch) {
    this.publicUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: "/supported" | "/verify" | "/settle", body?: unknown, signal?: AbortSignal) {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.publicUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        cache: "no-store",
        headers: body === undefined
          ? {Accept: "application/json"}
          : {Accept: "application/json", "Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestSignal(signal),
      });
    } catch {
      throw new Blocky402Error("BLOCKY402_UNAVAILABLE");
    }
    if (!response.ok) throw new Blocky402Error("BLOCKY402_UNAVAILABLE");
    const json = await response.json().catch(() => null);
    if (!json || typeof json !== "object") throw new Blocky402Error("BLOCKY402_INVALID_RESPONSE");
    return json;
  }

  async supported(signal?: AbortSignal) {
    const parsed = supportedSchema.safeParse(await this.request("/supported", undefined, signal));
    if (!parsed.success) throw new Blocky402Error("BLOCKY402_INVALID_RESPONSE");
    const capability = parsed.data.kinds.find((kind) =>
      kind.x402Version === 2 && kind.scheme === "exact" && kind.network === "hedera:testnet"
      && typeof kind.extra?.feePayer === "string",
    );
    if (!capability?.extra?.feePayer) throw new Blocky402Error("BLOCKY402_INVALID_RESPONSE");
    return {capability, feePayer: capability.extra.feePayer};
  }

  async verify(payload: X402PaymentPayload, requirements: X402PaymentRequirements, signal?: AbortSignal) {
    const raw = await this.request("/verify", {
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }, signal);
    const parsed = verifySchema.safeParse(raw);
    if (!parsed.success) throw new Blocky402Error("BLOCKY402_INVALID_RESPONSE");
    return {
      valid: parsed.data.isValid,
      payer: parsed.data.payer ?? null,
      reason: parsed.data.invalidReason ?? parsed.data.invalidMessage ?? null,
      evidence: raw,
    };
  }

  async settle(payload: X402PaymentPayload, requirements: X402PaymentRequirements, signal?: AbortSignal) {
    const raw = await this.request("/settle", {
      x402Version: 2,
      paymentPayload: payload,
      paymentRequirements: requirements,
    }, signal);
    const parsed = settleSchema.safeParse(raw);
    if (!parsed.success) throw new Blocky402Error("BLOCKY402_INVALID_RESPONSE");
    const success = parsed.data.success
      && parsed.data.network === "hedera:testnet"
      && Boolean(parsed.data.transaction)
      && Boolean(parsed.data.payer);
    return {
      success,
      payer: parsed.data.payer ?? null,
      transaction: parsed.data.transaction ?? null,
      reason: parsed.data.errorReason ?? parsed.data.errorMessage ?? null,
      evidence: raw,
    };
  }
}
