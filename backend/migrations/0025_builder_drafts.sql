-- Data model 1.18: mutable Builder working drafts remain isolated from immutable versions and deployments.

CREATE TABLE "product_builder_drafts" (
  "data_product_id" uuid NOT NULL,
  "draft_schema_version" integer NOT NULL CHECK ("draft_schema_version" = 1),
  "origin_key" text NOT NULL CHECK (length("origin_key") BETWEEN 1 AND 512),
  "structured_dag_json" jsonb NOT NULL CHECK (jsonb_typeof("structured_dag_json") = 'object'),
  "layout_json" jsonb NOT NULL CHECK (jsonb_typeof("layout_json") = 'object'),
  "content_hash" text NOT NULL CHECK ("content_hash" ~ '^[0-9a-f]{64}$'),
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 1 CHECK ("lock_version" >= 1),
  PRIMARY KEY ("data_product_id"),
  CONSTRAINT "fk_builder_draft_product" FOREIGN KEY ("data_product_id") REFERENCES "data_products" ("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_builder_draft_user" FOREIGN KEY ("updated_by_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
);

CREATE INDEX "ix_product_builder_drafts_updated_by" ON "product_builder_drafts" ("updated_by_user_id");

CREATE FUNCTION sprue_guard_builder_draft_actor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM data_products p
    JOIN workspace_members m
      ON m.workspace_id=p.workspace_id AND m.user_id=NEW.updated_by_user_id
    WHERE p.id=NEW.data_product_id AND p.deleted_at IS NULL
      AND m.role='owner' AND m.status='active'
  ) THEN
    RAISE EXCEPTION 'builder draft actor is not active product owner' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "scope_product_builder_drafts"
  AFTER INSERT OR UPDATE ON "product_builder_drafts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sprue_guard_builder_draft_actor();

CREATE FUNCTION sprue_guard_builder_draft_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.data_product_id IS DISTINCT FROM OLD.data_product_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'builder draft identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.lock_version <> OLD.lock_version + 1 THEN
    RAISE EXCEPTION 'builder draft lock version must advance exactly once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "identity_product_builder_drafts"
  BEFORE UPDATE ON "product_builder_drafts"
  FOR EACH ROW EXECUTE FUNCTION sprue_guard_builder_draft_identity();
