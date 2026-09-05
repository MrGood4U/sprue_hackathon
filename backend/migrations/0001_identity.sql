-- Data model 1.4: identity. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "auth_provider" text NOT NULL CHECK ("auth_provider" IN ('privy')),
  "auth_subject" text NOT NULL,
  "display_name" text,
  "status" text NOT NULL CHECK ("status" IN ('active', 'suspended', 'closed')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz,
  PRIMARY KEY ("id")
);

CREATE TABLE "workspaces" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_user_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('active', 'suspended', 'archived')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "lock_version" integer NOT NULL DEFAULT 0 CHECK ("lock_version" >= 0),
  PRIMARY KEY ("id")
);

CREATE TABLE "workspace_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('owner', 'builder', 'viewer')),
  "status" text NOT NULL CHECK ("status" IN ('active', 'invited', 'revoked')),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz,
  PRIMARY KEY ("id")
);
