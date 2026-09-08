import type {SqlClient} from "../../db/migrations.js";
import {
  graphFundingAsset,
  graphFundingNetwork,
  hederaRevenueAsset,
  hederaRevenueNetwork,
  type AccountWalletRecord,
  type WalletAddressRecord,
  type WalletRepository,
  WalletStorageError,
} from "./contracts.js";

const projection = `aw.id,aw.workspace_id,aw.owner_user_id,aw.provider,
  aw.provider_wallet_id,aw.provider_chain_type,aw.label,aw.control_model,
  aw.status,aw.updated_at,wa.id AS address_id,wa.network_id,n.name AS network,
  wa.address_kind,wa.address,wa.identity_status,wa.account_completion_status,
  wa.network_account_ref,wa.control_status,wa.can_receive,wa.can_spend,wa.verified_at,
  wa.status AS address_status`;

function records(rows: readonly Record<string, unknown>[]): AccountWalletRecord[] {
  const wallets = new Map<string, AccountWalletRecord & {addresses: WalletAddressRecord[]}>();
  for (const row of rows) {
    const id = String(row.id);
    let wallet = wallets.get(id);
    if (!wallet) {
      wallet = {
        id,
        workspaceId: String(row.workspace_id),
        ownerUserId: String(row.owner_user_id),
        provider: "privy",
        providerWalletId: String(row.provider_wallet_id),
        providerChainType: "ethereum",
        label: typeof row.label === "string" ? row.label : null,
        controlModel: "user_owned",
        status: String(row.status) as "active" | "restricted",
        updatedAt: new Date(String(row.updated_at)),
        addresses: [],
      };
      wallets.set(id, wallet);
    }
    if (row.address_id) {
      wallet.addresses.push({
        id: String(row.address_id),
        networkId: String(row.network_id),
        network: String(row.network),
        addressKind: String(row.address_kind) as WalletAddressRecord["addressKind"],
        address: String(row.address),
        networkAccountRef: typeof row.network_account_ref === "string"
          ? row.network_account_ref
          : null,
        identityStatus: String(row.identity_status) as WalletAddressRecord["identityStatus"],
        accountCompletionStatus: String(row.account_completion_status) as WalletAddressRecord["accountCompletionStatus"],
        controlStatus: String(row.control_status) as WalletAddressRecord["controlStatus"],
        canReceive: Boolean(row.can_receive),
        canSpend: Boolean(row.can_spend),
        verifiedAt: row.verified_at ? new Date(String(row.verified_at)) : null,
        status: String(row.address_status) as "active" | "disabled",
      });
    }
  }
  return [...wallets.values()];
}

export function postgresWalletRepository(
  client: Pick<SqlClient, "query">,
): WalletRepository {
  return {
    async findPrimary(workspaceId) {
      const result = await client.query(
        `SELECT ${projection}
        FROM account_wallets aw
        LEFT JOIN wallet_addresses wa ON wa.account_wallet_id=aw.id
        LEFT JOIN networks n ON n.id=wa.network_id
        WHERE aw.workspace_id=$1 AND aw.provider='privy'
          AND aw.provider_chain_type='ethereum'
          AND aw.status IN ('active','restricted')
        ORDER BY aw.created_at,aw.id,wa.created_at,wa.id`,
        [workspaceId],
      );
      return records(result.rows)[0] ?? null;
    },

    async bindProviderWallet({workspaceId, ownerUserId, wallet}) {
      const normalizedAddress = wallet.address.toLowerCase();
      const result = await client.query(
        `WITH network AS (
          SELECT id FROM networks
          WHERE namespace=$6 AND reference=$7 AND status='enabled'
        ), inserted_wallet AS (
          INSERT INTO account_wallets (
            workspace_id,owner_user_id,provider,provider_wallet_id,
            provider_external_id,provider_chain_type,provider_owner_id,
            provider_owner_type,label,control_model,status
          )
          SELECT $1,$2,'privy',$3,$4,'ethereum',$5,'user',
            'Sprue account wallet','user_owned','active'
          FROM network
          ON CONFLICT DO NOTHING
          RETURNING id
        ), owned_wallet AS (
          SELECT id FROM account_wallets
          WHERE provider='privy' AND provider_wallet_id=$3
            AND workspace_id=$1 AND owner_user_id=$2
          UNION ALL SELECT id FROM inserted_wallet
          LIMIT 1
        ), address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,
            normalized_address,identity_status,account_completion_status,
            can_spend,can_receive,control_status,control_evidence_ref,
            verified_at,status
          )
          SELECT owned_wallet.id,network.id,'evm',$8,$9,'resolved',
            'not_applicable',false,true,'verified',$10,now(),'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            address=EXCLUDED.address,
            identity_status='resolved',
            can_receive=true,
            control_status='verified',
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=now(),status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING account_wallet_id
        )
        SELECT count(*)::integer AS count FROM address`,
        [
          workspaceId,
          ownerUserId,
          wallet.id,
          wallet.externalId,
          wallet.ownerPrivyUserId,
          graphFundingNetwork.namespace,
          graphFundingNetwork.reference,
          wallet.address,
          normalizedAddress,
          `privy:wallet:${wallet.id}:user-owner`,
        ],
      );
      if (Number(result.rows[0]?.count) !== 1) throw new WalletStorageError();
      const stored = await this.findPrimary(workspaceId);
      if (!stored || stored.providerWalletId !== wallet.id) {
        throw new WalletStorageError();
      }
      return stored;
    },

    async appendGraphFundingBalance({workspaceId, walletAddressId, balance}) {
      const result = await client.query(
        `INSERT INTO wallet_balance_snapshots (
          wallet_address_id,asset_id,balance_atomic,provider,observed_at
        )
        SELECT wa.id,a.id,$3,'privy',$4
        FROM wallet_addresses wa
        JOIN account_wallets aw ON aw.id=wa.account_wallet_id
        JOIN networks n ON n.id=wa.network_id
        JOIN assets a ON a.network_id=n.id
        WHERE aw.workspace_id=$1 AND wa.id=$2
          AND n.namespace=$5 AND n.reference=$6
          AND a.standard=$7 AND a.asset_identifier=$8
          AND a.status='enabled'
        RETURNING id`,
        [
          workspaceId,
          walletAddressId,
          balance.balanceAtomic,
          balance.observedAt,
          graphFundingNetwork.namespace,
          graphFundingNetwork.reference,
          graphFundingAsset.standard,
          graphFundingAsset.identifier,
        ],
      );
      if (result.rows.length !== 1) throw new WalletStorageError();
    },

    async beginHederaActivation(input) {
      const result = await client.query(
        `WITH inserted AS (
          INSERT INTO control_commands (
            actor_user_id,workspace_id,operation,idempotency_key,
            request_fingerprint,fingerprint_key_version,status,cancellation,
            dispatch_required,subject_type,subject_id
          )
          SELECT $2,$1,'activate_hedera_account',$4,$5,$6,
            'running','not_supported',false,'account_wallet',$3
          FROM account_wallets
          WHERE id=$3 AND workspace_id=$1 AND owner_user_id=$2
          ON CONFLICT (actor_user_id,workspace_id,operation,idempotency_key)
          DO NOTHING
          RETURNING id,status,request_fingerprint
        )
        SELECT id,status,request_fingerprint,true AS created FROM inserted
        UNION ALL
        SELECT id,status,request_fingerprint,false AS created FROM control_commands
        WHERE actor_user_id=$2 AND workspace_id=$1
          AND operation='activate_hedera_account' AND idempotency_key=$4
        LIMIT 1`,
        [
          input.workspaceId,
          input.actorUserId,
          input.walletId,
          input.idempotencyKey,
          input.requestFingerprint,
          input.fingerprintKeyVersion,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new WalletStorageError();
      return {
        commandId: String(row.id),
        created: Boolean(row.created),
        status: String(row.status) as "running" | "succeeded" | "failed",
        requestFingerprint: String(row.request_fingerprint),
      };
    },

    async recordHederaAccount({workspaceId, walletId, observation}) {
      const evidenceRef = `mirror:account:${observation.accountId}:${observation.balanceConsensusTimestamp ?? observation.observedAt.toISOString()}`;
      const result = await client.query(
        `WITH network AS (
          SELECT id FROM networks
          WHERE namespace=$3 AND reference=$4 AND status='enabled'
        ), owned_wallet AS (
          SELECT id FROM account_wallets
          WHERE id=$2 AND workspace_id=$1 AND provider='privy'
            AND provider_chain_type='ethereum'
            AND status IN ('active','restricted')
        ), evm_address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,normalized_address,
            network_account_ref,identity_status,identity_evidence_ref,
            account_completion_status,can_spend,can_receive,control_status,
            control_evidence_ref,verified_at,status
          )
          SELECT owned_wallet.id,network.id,'hedera_evm_address',$5,$6,$7,
            'resolved',$8,$9,($9='complete' AND $17::boolean),
            ($9='complete' AND $17::boolean AND $12),
            CASE WHEN $9='complete' AND $17::boolean THEN 'verified' ELSE 'pending' END,
            CASE WHEN $9='complete' AND $17::boolean THEN $8 ELSE NULL END,
            CASE WHEN $9='complete' AND $17::boolean THEN $14::timestamptz ELSE NULL END,'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            network_account_ref=EXCLUDED.network_account_ref,
            identity_status='resolved',identity_evidence_ref=EXCLUDED.identity_evidence_ref,
            account_completion_status=EXCLUDED.account_completion_status,
            can_spend=EXCLUDED.can_spend,can_receive=EXCLUDED.can_receive,
            control_status=EXCLUDED.control_status,
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=EXCLUDED.verified_at,status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING id
        ), account_address AS (
          INSERT INTO wallet_addresses (
            account_wallet_id,network_id,address_kind,address,normalized_address,
            network_account_ref,identity_status,identity_evidence_ref,
            account_completion_status,can_spend,can_receive,control_status,
            control_evidence_ref,verified_at,status
          )
          SELECT owned_wallet.id,network.id,'hedera_account_id',$7,$7,$7,
            'resolved',$8,$9,($9='complete' AND $17::boolean),
            ($9='complete' AND $17::boolean AND $12),
            CASE WHEN $9='complete' AND $17::boolean THEN 'verified' ELSE 'pending' END,
            CASE WHEN $9='complete' AND $17::boolean THEN $8 ELSE NULL END,
            CASE WHEN $9='complete' AND $17::boolean THEN $14::timestamptz ELSE NULL END,'active'
          FROM owned_wallet CROSS JOIN network
          ON CONFLICT (network_id,address_kind,normalized_address) DO UPDATE SET
            network_account_ref=EXCLUDED.network_account_ref,
            identity_status='resolved',identity_evidence_ref=EXCLUDED.identity_evidence_ref,
            account_completion_status=EXCLUDED.account_completion_status,
            can_spend=EXCLUDED.can_spend,can_receive=EXCLUDED.can_receive,
            control_status=EXCLUDED.control_status,
            control_evidence_ref=EXCLUDED.control_evidence_ref,
            verified_at=EXCLUDED.verified_at,status='active'
          WHERE wallet_addresses.account_wallet_id=EXCLUDED.account_wallet_id
          RETURNING id
        ), asset AS (
          SELECT a.id FROM assets a JOIN network n ON n.id=a.network_id
          WHERE a.standard=$10 AND a.asset_identifier=$11 AND a.status='enabled'
        ), capability AS (
          INSERT INTO wallet_asset_capabilities (
            wallet_address_id,asset_id,association_status,can_receive,can_spend,
            receiver_signature_required,evidence_source,evidence_ref,status,observed_at
          )
          SELECT account_address.id,asset.id,'not_required',$12,($9='complete' AND $17::boolean),$13,
            'hedera_mirror_node',$8,'active',$14
          FROM account_address CROSS JOIN asset
          ON CONFLICT (wallet_address_id,asset_id) WHERE status='active' DO UPDATE SET
            association_status='not_required',can_receive=EXCLUDED.can_receive,
            can_spend=EXCLUDED.can_spend,receiver_signature_required=EXCLUDED.receiver_signature_required,
            evidence_source='hedera_mirror_node',evidence_ref=EXCLUDED.evidence_ref,
            observed_at=EXCLUDED.observed_at
          RETURNING wallet_address_id,asset_id
        ), balance AS (
          INSERT INTO wallet_balance_snapshots (
            wallet_address_id,asset_id,balance_atomic,block_or_consensus_ref,
            provider,observed_at
          )
          SELECT capability.wallet_address_id,capability.asset_id,$15,$16,
            'hedera_mirror_node',$14
          FROM capability
          RETURNING id
        ), touched AS (
          UPDATE account_wallets SET updated_at=now()
          WHERE id IN (SELECT id FROM owned_wallet)
          RETURNING id
        )
        SELECT
          (SELECT count(*) FROM evm_address)::integer AS evm_count,
          (SELECT count(*) FROM account_address)::integer AS account_count,
          (SELECT count(*) FROM capability)::integer AS capability_count,
          (SELECT count(*) FROM balance)::integer AS balance_count,
          (SELECT count(*) FROM touched)::integer AS wallet_count`,
        [
          workspaceId,
          walletId,
          hederaRevenueNetwork.namespace,
          hederaRevenueNetwork.reference,
          observation.evmAddress,
          observation.evmAddress.toLowerCase(),
          observation.accountId,
          evidenceRef,
          observation.accountCompletionStatus,
          hederaRevenueAsset.standard,
          hederaRevenueAsset.identifier,
          observation.canReceive,
          observation.receiverSignatureRequired,
          observation.observedAt,
          observation.balanceAtomic,
          observation.balanceConsensusTimestamp,
          observation.canSpend,
        ],
      );
      const row = result.rows[0];
      if (
        Number(row?.evm_count) !== 1 ||
        Number(row?.account_count) !== 1 ||
        Number(row?.capability_count) !== 1 ||
        Number(row?.balance_count) !== 1 ||
        Number(row?.wallet_count) !== 1
      ) throw new WalletStorageError();
      const stored = await this.findPrimary(workspaceId);
      if (!stored || stored.id !== walletId) throw new WalletStorageError();
      return stored;
    },

    async finishHederaActivation({commandId, status, errorCode}) {
      const result = await client.query(
        `UPDATE control_commands
        SET status=$2,error_code=$3,updated_at=now(),finished_at=now()
        WHERE id=$1 AND status='running'
        RETURNING id`,
        [commandId, status, errorCode ?? null],
      );
      if (result.rows.length !== 1) throw new WalletStorageError();
    },
  };
}
