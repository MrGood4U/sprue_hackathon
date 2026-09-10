-- Data model 1.16: immutable live versions may pin a Graph manifest IPFS CID.

ALTER TABLE source_snapshots
  DROP CONSTRAINT source_snapshots_gateway_target_type_check;

ALTER TABLE source_snapshots
  ADD CONSTRAINT source_snapshots_gateway_target_type_check
  CHECK (gateway_target_type IN ('deployment_id', 'subgraph_id', 'manifest_ipfs_cid'));
