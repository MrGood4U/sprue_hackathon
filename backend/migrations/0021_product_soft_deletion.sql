ALTER TABLE data_products
  ADD COLUMN deleted_at timestamptz;

ALTER TABLE data_products
  ADD CONSTRAINT ck_data_products_deleted_at
  CHECK (deleted_at IS NULL OR deleted_at >= created_at);

CREATE INDEX ix_data_products_visible_workspace_updated
  ON data_products (workspace_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;
