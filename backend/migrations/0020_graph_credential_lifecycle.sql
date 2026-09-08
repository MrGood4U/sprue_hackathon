-- Data model 1.11: validated workspace Graph credential selection and revocation.

ALTER TABLE "provider_credentials"
  ADD COLUMN "is_selected" boolean NOT NULL DEFAULT false;

ALTER TABLE "provider_credentials"
  ADD CONSTRAINT "provider_credentials_selected_active_ck"
  CHECK (NOT "is_selected" OR "status" = 'active');

CREATE UNIQUE INDEX "provider_credentials_workspace_selected_uq"
  ON "provider_credentials" ("workspace_id", "provider")
  WHERE "is_selected";
