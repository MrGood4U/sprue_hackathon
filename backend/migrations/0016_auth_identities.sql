-- Data model 1.6: keep Sprue users independent from replaceable login providers.

CREATE TABLE "auth_identities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL CHECK ("provider" ~ '^[a-z][a-z0-9_]{0,31}$'),
  "provider_subject" text NOT NULL CHECK (char_length("provider_subject") BETWEEN 1 AND 500),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'revoked')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz,
  "revoked_at" timestamptz,
  PRIMARY KEY ("id"),
  CHECK (("status" = 'active' AND "revoked_at" IS NULL) OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL))
);

INSERT INTO "auth_identities" (
  "user_id", "provider", "provider_subject", "status", "created_at", "last_seen_at"
)
SELECT "id", "auth_provider", "auth_subject", 'active', "created_at", "last_seen_at"
FROM "users";

ALTER TABLE "auth_identities" ADD CONSTRAINT fk_150
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT;
ALTER TABLE "auth_identities" ADD CONSTRAINT uq_050
  UNIQUE ("provider", "provider_subject");
CREATE INDEX ix_169 ON "auth_identities" ("user_id", "status");

ALTER TABLE "users" DROP CONSTRAINT uq_001;
ALTER TABLE "users" DROP COLUMN "auth_provider";
ALTER TABLE "users" DROP COLUMN "auth_subject";
