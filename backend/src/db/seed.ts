import type { SqlClient } from "./migrations.js";

// Public reference metadata only. No wallet, grant, balance, quote or payment is seeded.
export const referenceNetworks = [
  { namespace: "eip155", reference: "8453", environment: "mainnet", name: "Base" },
  { namespace: "eip155", reference: "84532", environment: "testnet", name: "Base Sepolia" },
  { namespace: "hedera", reference: "testnet", environment: "testnet", name: "Hedera Testnet" },
];
export async function seedReferenceData(client: SqlClient) {
  await client.exec("BEGIN");
  try {
    for (const network of referenceNetworks) {
      await client.query("INSERT INTO networks(namespace, reference, environment, name, status) VALUES ($1,$2,$3,$4,'enabled') ON CONFLICT(namespace, reference) DO NOTHING", [network.namespace, network.reference, network.environment, network.name]);
      const record = (await client.query("SELECT environment FROM networks WHERE namespace=$1 AND reference=$2", [network.namespace, network.reference])).rows[0];
      if (record?.environment !== network.environment) throw new Error("REFERENCE_NETWORK_MISMATCH");
    }
    await client.exec("INSERT INTO assets(network_id, standard, asset_type, asset_identifier, symbol, decimals, status) SELECT id, 'native', 'fungible', '0.0.0', 'HBAR', 8, 'enabled' FROM networks WHERE namespace='hedera' AND reference='testnet' ON CONFLICT(network_id, standard, asset_identifier) DO NOTHING");
    const asset = (await client.query("SELECT a.asset_type, a.decimals, a.symbol FROM assets a JOIN networks n ON n.id=a.network_id WHERE n.namespace='hedera' AND n.reference='testnet' AND a.standard='native' AND a.asset_identifier='0.0.0'")).rows[0];
    if (asset?.asset_type !== "fungible" || Number(asset?.decimals) !== 8 || asset?.symbol !== "HBAR") throw new Error("REFERENCE_ASSET_MISMATCH");
    await client.exec("COMMIT");
    return { referenceNetworks: referenceNetworks.length, referenceAssets: 1 };
  } catch (error) { await client.exec("ROLLBACK"); throw error; }
}
