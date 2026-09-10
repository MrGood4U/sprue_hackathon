-- Data model 1.15: a live deployment activates an immutable version without a materialization.

ALTER TABLE deployments DROP CONSTRAINT ck_027;
ALTER TABLE deployments ADD CONSTRAINT ck_027
  CHECK ((active_materialization_id IS NULL OR active_version_id IS NOT NULL) IS TRUE);

ALTER TABLE deployments DROP CONSTRAINT uq_020;
ALTER TABLE deployments ADD CONSTRAINT uq_020
  UNIQUE (workspace_id, environment, endpoint_slug);

DROP TRIGGER lineage_deployments ON deployments;

CREATE FUNCTION sprue_check_live_deployment_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE version_row record; materialization_row record;
BEGIN
  IF NEW.active_version_id IS NOT NULL THEN
    SELECT * INTO version_row FROM data_product_versions WHERE id = NEW.active_version_id;
    IF NOT FOUND OR version_row.data_product_id IS DISTINCT FROM NEW.data_product_id OR version_row.status <> 'ready' THEN
      RAISE EXCEPTION 'invalid active version' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.active_materialization_id IS NOT NULL THEN
    SELECT * INTO materialization_row FROM materializations WHERE id = NEW.active_materialization_id;
    IF NOT FOUND OR materialization_row.data_product_version_id IS DISTINCT FROM NEW.active_version_id OR materialization_row.status <> 'ready' THEN
      RAISE EXCEPTION 'invalid active materialization' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.active_publication_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM publication_versions
    WHERE id = NEW.active_publication_version_id AND deployment_id = NEW.id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'active publication mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER lineage_deployments
  AFTER INSERT OR UPDATE ON deployments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION sprue_check_live_deployment_lineage();
