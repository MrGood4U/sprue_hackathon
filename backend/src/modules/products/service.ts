import {createHmac, randomUUID} from "node:crypto";
import {
  ProductCommandConflictError,
  ProductInputError,
  ProductNotFoundError,
  ProductPreconditionError,
  ProductStorageError,
  ProductWalletNotFoundError,
  type ProductDetail,
  type ProductDeletion,
  type ProductRepository,
  type ProductStatus,
} from "./contracts.js";

function text(value: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new ProductInputError();
  return normalized;
}

function optionalText(value: string | null | undefined, maximum: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ProductInputError();
  return normalized || null;
}

function initialIntent(value: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ProductInputError();
  return normalized;
}

function slug(name: string, id: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "product";
  return `${base}-${id.slice(0, 8)}`;
}

function cursorScope(query?: string, status?: ProductStatus) {
  return {query: query ?? null, status: status ?? null};
}

export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly commandFingerprintKey: Buffer,
    private readonly fingerprintKeyVersion: string,
  ) {}

  private fingerprint(operation: string, values: unknown[]) {
    const hmac = createHmac("sha256", this.commandFingerprintKey).update(operation);
    for (const value of values) hmac.update("\0").update(JSON.stringify(value));
    return hmac.digest("hex");
  }

  async list(input: {
    workspaceId: string;
    query?: string;
    status?: ProductStatus;
    limit: number;
    cursor?: string;
  }) {
    const query = input.query ? text(input.query, 100) : undefined;
    let cursor: {updatedAt: Date; id: string} | undefined;
    if (input.cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")) as {
          updatedAt?: unknown;
          id?: unknown;
          query?: unknown;
          status?: unknown;
        };
        const updatedAt = new Date(String(parsed.updatedAt));
        const scope = cursorScope(query, input.status);
        if (
          !Number.isFinite(updatedAt.getTime()) ||
          typeof parsed.id !== "string" ||
          parsed.query !== scope.query ||
          parsed.status !== scope.status
        ) throw new Error("INVALID_CURSOR");
        cursor = {updatedAt, id: parsed.id};
      } catch {
        throw new ProductInputError();
      }
    }
    try {
      const result = await this.repository.list({
        workspaceId: input.workspaceId,
        query,
        status: input.status,
        limit: input.limit,
        cursor,
      });
      const finalItem = result.items.at(-1);
      const nextCursor = result.hasMore && finalItem
        ? Buffer.from(JSON.stringify({
            updatedAt: finalItem.updatedAt,
            id: finalItem.id,
            ...cursorScope(query, input.status),
          })).toString("base64url")
        : null;
      return {items: result.items, nextCursor, hasMore: result.hasMore};
    } catch (error) {
      if (error instanceof ProductInputError) throw error;
      throw new ProductStorageError();
    }
  }

  async read(workspaceId: string, productId: string): Promise<ProductDetail> {
    try {
      const product = await this.repository.find(workspaceId, productId);
      if (!product) throw new ProductNotFoundError();
      return product;
    } catch (error) {
      if (error instanceof ProductNotFoundError) throw error;
      throw new ProductStorageError();
    }
  }

  async delivery(workspaceId: string, productId: string) {
    try {
      const result = await this.repository.delivery(workspaceId, productId);
      if (!result) throw new ProductNotFoundError();
      return result;
    } catch (error) {
      if (error instanceof ProductNotFoundError) throw error;
      throw new ProductStorageError();
    }
  }

  async create(input: {
    workspaceId: string;
    actorUserId: string;
    accountWalletId: string;
    name: string;
    description?: string | null;
    originalIntent: string;
    idempotencyKey: string;
  }): Promise<ProductDetail> {
    const id = randomUUID();
    const name = text(input.name, 120);
    const description = optionalText(input.description, 2000) ?? null;
    const originalIntent = initialIntent(input.originalIntent, 8000);
    const requestFingerprint = this.fingerprint("create_data_product", [
      input.workspaceId,
      input.accountWalletId,
      name,
      description,
      originalIntent,
    ]);
    try {
      const result = await this.repository.create({
        id,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        accountWalletId: input.accountWalletId,
        slug: slug(name, id),
        name,
        description,
        originalIntent,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        fingerprintKeyVersion: this.fingerprintKeyVersion,
      });
      if (result.kind === "wallet_not_found") throw new ProductWalletNotFoundError();
      if (result.kind === "command_conflict") throw new ProductCommandConflictError();
      if ("product" in result) return result.product;
      throw new ProductStorageError();
    } catch (error) {
      if (
        error instanceof ProductWalletNotFoundError ||
        error instanceof ProductCommandConflictError
      ) throw error;
      throw new ProductStorageError();
    }
  }

  async update(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    name?: string;
    description?: string | null;
    expectedLockVersion: number;
    idempotencyKey: string;
  }): Promise<ProductDetail> {
    if (input.name === undefined && input.description === undefined) {
      throw new ProductInputError();
    }
    const name = input.name === undefined ? undefined : text(input.name, 120);
    const description = optionalText(input.description, 2000);
    const requestFingerprint = this.fingerprint("update_data_product", [
      input.workspaceId,
      input.productId,
      input.expectedLockVersion,
      name ?? null,
      description ?? null,
    ]);
    try {
      const result = await this.repository.update({
        ...input,
        name,
        description,
        requestFingerprint,
        fingerprintKeyVersion: this.fingerprintKeyVersion,
      });
      if (result.kind === "not_found") throw new ProductNotFoundError();
      if (result.kind === "precondition_failed") throw new ProductPreconditionError();
      if (result.kind === "command_conflict") throw new ProductCommandConflictError();
      if ("product" in result) return result.product;
      throw new ProductStorageError();
    } catch (error) {
      if (
        error instanceof ProductNotFoundError ||
        error instanceof ProductPreconditionError ||
        error instanceof ProductCommandConflictError
      ) throw error;
      throw new ProductStorageError();
    }
  }

  async delete(input: {
    workspaceId: string;
    productId: string;
    actorUserId: string;
    expectedLockVersion: number;
    idempotencyKey: string;
  }): Promise<ProductDeletion> {
    const requestFingerprint = this.fingerprint("delete_data_product", [
      input.workspaceId,
      input.productId,
      input.expectedLockVersion,
    ]);
    try {
      const result = await this.repository.delete({
        ...input,
        requestFingerprint,
        fingerprintKeyVersion: this.fingerprintKeyVersion,
      });
      if (result.kind === "not_found") throw new ProductNotFoundError();
      if (result.kind === "precondition_failed") throw new ProductPreconditionError();
      if (result.kind === "command_conflict") throw new ProductCommandConflictError();
      if ("deletion" in result) return result.deletion;
      throw new ProductStorageError();
    } catch (error) {
      if (
        error instanceof ProductNotFoundError ||
        error instanceof ProductPreconditionError ||
        error instanceof ProductCommandConflictError
      ) throw error;
      throw new ProductStorageError();
    }
  }

  async overview(workspaceId: string) {
    try {
      return await this.repository.overview(workspaceId);
    } catch {
      throw new ProductStorageError();
    }
  }
}
