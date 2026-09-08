import type { SqlClient } from "./migrations.js";

// Public reference metadata only. No wallet, grant, balance, quote or payment is seeded.
export const referenceNetworks = [
  { namespace: "eip155", reference: "8453", environment: "mainnet", name: "Base" },
  { namespace: "eip155", reference: "84532", environment: "testnet", name: "Base Sepolia" },
  { namespace: "hedera", reference: "testnet", environment: "testnet", name: "Hedera Testnet" },
];
export const referenceAssets = [
  {
    namespace: "eip155",
    reference: "84532",
    standard: "erc20",
    assetType: "fungible",
    assetIdentifier: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    symbol: "USDC",
    decimals: 6,
  },
  {
    namespace: "hedera",
    reference: "testnet",
    standard: "native",
    assetType: "fungible",
    assetIdentifier: "0.0.0",
    symbol: "HBAR",
    decimals: 8,
  },
];
export async function seedReferenceData(client: SqlClient) {
  await client.exec("BEGIN");
  try {
    for (const network of referenceNetworks) {
      await client.query("INSERT INTO networks(namespace, reference, environment, name, status) VALUES ($1,$2,$3,$4,'enabled') ON CONFLICT(namespace, reference) DO NOTHING", [network.namespace, network.reference, network.environment, network.name]);
      const record = (await client.query("SELECT environment FROM networks WHERE namespace=$1 AND reference=$2", [network.namespace, network.reference])).rows[0];
      if (record?.environment !== network.environment) throw new Error("REFERENCE_NETWORK_MISMATCH");
    }
    for (const asset of referenceAssets) {
      await client.query(
        `INSERT INTO assets(network_id, standard, asset_type, asset_identifier, symbol, decimals, status)
        SELECT id,$3,$4,$5,$6,$7,'enabled' FROM networks
        WHERE namespace=$1 AND reference=$2
        ON CONFLICT(network_id, standard, asset_identifier) DO NOTHING`,
        [asset.namespace, asset.reference, asset.standard, asset.assetType, asset.assetIdentifier, asset.symbol, asset.decimals],
      );
      const record = (await client.query(
        `SELECT a.asset_type,a.decimals,a.symbol
        FROM assets a JOIN networks n ON n.id=a.network_id
        WHERE n.namespace=$1 AND n.reference=$2
          AND a.standard=$3 AND a.asset_identifier=$4`,
        [asset.namespace, asset.reference, asset.standard, asset.assetIdentifier],
      )).rows[0];
      if (
        record?.asset_type !== asset.assetType ||
        Number(record?.decimals) !== asset.decimals ||
        record?.symbol !== asset.symbol
      ) throw new Error("REFERENCE_ASSET_MISMATCH");
    }
    await client.exec("COMMIT");
    return { referenceNetworks: referenceNetworks.length, referenceAssets: referenceAssets.length };
  } catch (error) { await client.exec("ROLLBACK"); throw error; }
}
