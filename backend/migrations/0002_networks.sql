-- Data model 1.4: networks. Foreign keys follow after all cyclic targets exist.

CREATE TABLE "networks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "namespace" text NOT NULL,
  "reference" text NOT NULL,
  "environment" text NOT NULL CHECK ("environment" IN ('testnet', 'mainnet')),
  "name" text NOT NULL,
  "explorer_base_url" text,
  "status" text NOT NULL CHECK ("status" IN ('enabled', 'disabled')),
  PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "network_id" uuid NOT NULL,
  "standard" text NOT NULL CHECK ("standard" IN ('native', 'erc20', 'hts')),
  "asset_type" text NOT NULL CHECK ("asset_type" IN ('fungible', 'non_fungible')),
  "asset_identifier" text NOT NULL,
  "symbol" text NOT NULL,
  "decimals" smallint NOT NULL CHECK ("decimals" >= 0 AND "decimals" <= 255),
  "status" text NOT NULL CHECK ("status" IN ('enabled', 'disabled', 'unverified')),
  PRIMARY KEY ("id")
);
