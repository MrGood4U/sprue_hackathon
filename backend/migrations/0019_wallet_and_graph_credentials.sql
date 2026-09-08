-- Data model 1.9: encrypted Graph credentials stored behind logical references.

CREATE TABLE "provider_credential_secrets" (
  "provider_credential_id" uuid NOT NULL,
  "api_key_ciphertext" bytea NOT NULL,
  "encryption_key_id" text NOT NULL,
  "encryption_iv" bytea NOT NULL CHECK (octet_length("encryption_iv") = 12),
  "encryption_auth_tag" bytea NOT NULL CHECK (octet_length("encryption_auth_tag") = 16),
  "secret_version" integer NOT NULL CHECK ("secret_version" > 0),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("provider_credential_id"),
  CONSTRAINT "provider_credential_secrets_credential_fk"
    FOREIGN KEY ("provider_credential_id") REFERENCES "provider_credentials"("id") ON DELETE RESTRICT
);

CREATE INDEX "provider_credential_secrets_key_version_idx"
  ON "provider_credential_secrets" ("encryption_key_id", "secret_version");
