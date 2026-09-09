/**
 * Checked-in projection of The Graph Networks Registry v0.7.119 (2026-09-04).
 *
 * Only entries that advertise the `subgraphs` service are included. Keeping a
 * versioned local projection makes planning deterministic and available when
 * the registry is temporarily unreachable. Refresh this file from the official
 * registry rather than adding request-specific network branches elsewhere.
 *
 * Source: https://networks-registry.thegraph.com/TheGraphNetworksRegistry.json
 */
export const graphNetworksRegistryVersion = "0.7.119";

export interface GraphSubgraphNetwork {
  dataNetwork: string;
  graphNetworkId: string;
  label: string;
  networkType: "mainnet" | "testnet";
  aliases: readonly string[];
}

export const graphSubgraphNetworkCatalog: readonly GraphSubgraphNetwork[] = [
  {dataNetwork: "eip155:42170", graphNetworkId: "arbitrum-nova", label: "Arbitrum Nova Mainnet", networkType: "mainnet", aliases: ["arb-nova", "arbitrum-nova", "arbitrum-nova-mainnet", "arbnova", "evm-42170"]},
  {dataNetwork: "eip155:42161", graphNetworkId: "arbitrum-one", label: "Arbitrum One Mainnet", networkType: "mainnet", aliases: ["arbitrum", "arbitrum-one", "arbitrum-one-mainnet", "arbone", "evm-42161"]},
  {dataNetwork: "eip155:5042", graphNetworkId: "arc", label: "Arc Mainnet", networkType: "mainnet", aliases: ["arc", "arc-mainnet", "evm-5042"]},
  {dataNetwork: "eip155:43114", graphNetworkId: "avalanche", label: "Avalanche C-Chain", networkType: "mainnet", aliases: ["avalanche", "avalanche-mainnet", "evm-43114"]},
  {dataNetwork: "eip155:8453", graphNetworkId: "base", label: "Base Chain", networkType: "mainnet", aliases: ["base", "base-chain", "base-mainnet", "evm-8453"]},
  {dataNetwork: "eip155:56", graphNetworkId: "bsc", label: "BNB Smart Chain Mainnet", networkType: "mainnet", aliases: ["bnb", "bnb-mainnet", "bsc", "bsc-mainnet", "evm-56"]},
  {dataNetwork: "eip155:288", graphNetworkId: "boba", label: "Boba Network", networkType: "mainnet", aliases: ["boba", "boba-mainnet", "evm-288"]},
  {dataNetwork: "eip155:3637", graphNetworkId: "botanix", label: "Botanix Mainnet", networkType: "mainnet", aliases: ["botanix", "botanix-mainnet", "evm-3637"]},
  {dataNetwork: "eip155:42220", graphNetworkId: "celo", label: "Celo Mainnet", networkType: "mainnet", aliases: ["celo", "celo-mainnet", "evm-42220"]},
  {dataNetwork: "eip155:88888", graphNetworkId: "chiliz", label: "Chiliz Mainnet", networkType: "mainnet", aliases: ["chiliz", "chiliz-mainnet", "evm-88888"]},
  {dataNetwork: "eip155:1", graphNetworkId: "mainnet", label: "Ethereum Mainnet", networkType: "mainnet", aliases: ["eth", "eth-mainnet", "ethereum", "evm-1", "mainnet"]},
  {dataNetwork: "eip155:42793", graphNetworkId: "etherlink-mainnet", label: "Etherlink Mainnet", networkType: "mainnet", aliases: ["etherlink", "etherlink-mainnet"]},
  {dataNetwork: "eip155:100", graphNetworkId: "gnosis", label: "Gnosis Mainnet", networkType: "mainnet", aliases: ["evm-100", "gnosis", "gnosis-mainnet", "xdai"]},
  {dataNetwork: "eip155:43111", graphNetworkId: "hemi", label: "Hemi Mainnet", networkType: "mainnet", aliases: ["evm-43111", "hemi", "hemi-mainnet"]},
  {dataNetwork: "eip155:1776", graphNetworkId: "injective-evm", label: "Injective EVM Mainnet", networkType: "mainnet", aliases: ["evm-1776", "injective-evm", "injective-evm-mainnet"]},
  {dataNetwork: "eip155:81", graphNetworkId: "joc", label: "Japan Open Chain Mainnet", networkType: "mainnet", aliases: ["evm-81", "joc", "joc-mainnet"]},
  {dataNetwork: "eip155:8217", graphNetworkId: "kaia", label: "Kaia Mainnet", networkType: "mainnet", aliases: ["evm-8217", "kaia", "kaia-mainnet"]},
  {dataNetwork: "eip155:59144", graphNetworkId: "linea", label: "Linea Mainnet", networkType: "mainnet", aliases: ["evm-59144", "linea", "linea-mainnet"]},
  {dataNetwork: "near:mainnet", graphNetworkId: "near-mainnet", label: "Near Mainnet", networkType: "mainnet", aliases: ["near", "near-mainnet"]},
  {dataNetwork: "eip155:47763", graphNetworkId: "neox", label: "Neo X Mainnet", networkType: "mainnet", aliases: ["evm-47763", "neox", "neox-mainnet"]},
  {dataNetwork: "eip155:10", graphNetworkId: "optimism", label: "OP Mainnet", networkType: "mainnet", aliases: ["evm-10", "op-mainnet", "optimism", "optimism-mainnet"]},
  {dataNetwork: "eip155:3338", graphNetworkId: "peaq", label: "Peaq Network", networkType: "mainnet", aliases: ["evm-3338", "peaq", "peaq-mainnet"]},
  {dataNetwork: "eip155:137", graphNetworkId: "matic", label: "Polygon Mainnet", networkType: "mainnet", aliases: ["matic", "matic-mainnet", "polygon"]},
  {dataNetwork: "eip155:534352", graphNetworkId: "scroll", label: "Scroll Mainnet", networkType: "mainnet", aliases: ["evm-534352", "scroll", "scroll-mainnet"]},
  {dataNetwork: "eip155:1329", graphNetworkId: "sei-mainnet", label: "Sei Network", networkType: "mainnet", aliases: ["sei", "sei-evm-mainnet", "sei-mainnet"]},
  {dataNetwork: "eip155:1868", graphNetworkId: "soneium", label: "Soneium Mainnet", networkType: "mainnet", aliases: ["evm-1868", "soneium", "soneium-mainnet"]},
  {dataNetwork: "eip155:146", graphNetworkId: "sonic", label: "Sonic Mainnet", networkType: "mainnet", aliases: ["evm-146", "sonic", "sonic-mainnet"]},
  {dataNetwork: "eip155:988", graphNetworkId: "stable", label: "Stable", networkType: "mainnet", aliases: ["evm-988", "stable", "stable-mainnet"]},
  {dataNetwork: "eip155:4217", graphNetworkId: "tempo", label: "Tempo Mainnet", networkType: "mainnet", aliases: ["evm-4217", "tempo", "tempo-mainnet"]},
  {dataNetwork: "eip155:130", graphNetworkId: "unichain", label: "Unichain Mainnet", networkType: "mainnet", aliases: ["evm-130", "unichain", "unichain-mainnet"]},
  {dataNetwork: "eip155:88", graphNetworkId: "viction", label: "Viction Mainnet", networkType: "mainnet", aliases: ["evm-88", "viction", "viction-mainnet"]},
  {dataNetwork: "eip155:196", graphNetworkId: "xlayer-mainnet", label: "X Layer Mainnet", networkType: "mainnet", aliases: ["evm-196", "xlayer", "xlayer-mainnet"]},
  {dataNetwork: "eip155:7000", graphNetworkId: "zetachain", label: "ZetaChain Mainnet", networkType: "mainnet", aliases: ["evm-7000", "zetachain", "zetachain-mainnet"]},
  {dataNetwork: "eip155:324", graphNetworkId: "zksync-era", label: "zkSync Mainnet", networkType: "mainnet", aliases: ["evm-324", "zksync", "zksync-era", "zksync-era-mainnet"]},
  {dataNetwork: "eip155:421614", graphNetworkId: "arbitrum-sepolia", label: "Arbitrum Sepolia Testnet", networkType: "testnet", aliases: ["arb-sepolia", "arbitrum-sepolia", "arbsepolia", "evm-421614"]},
  {dataNetwork: "eip155:5042002", graphNetworkId: "arc-testnet", label: "Arc Testnet", networkType: "testnet", aliases: ["arc-testnet", "evm-5042002"]},
  {dataNetwork: "eip155:43113", graphNetworkId: "fuji", label: "Avalanche Fuji Testnet", networkType: "testnet", aliases: ["avalanche-fuji", "evm-43113", "fuji"]},
  {dataNetwork: "eip155:84532", graphNetworkId: "base-sepolia", label: "Base Sepolia Testnet", networkType: "testnet", aliases: ["base-sepolia", "base-testnet", "evm-84532"]},
  {dataNetwork: "eip155:97", graphNetworkId: "chapel", label: "BNB Smart Chain Chapel Testnet", networkType: "testnet", aliases: ["bnb-chapel", "bnb-testnet", "bsc-testnet", "chapel"]},
  {dataNetwork: "eip155:28882", graphNetworkId: "boba-testnet", label: "Boba Sepolia Testnet", networkType: "testnet", aliases: ["boba-sepolia", "boba-testnet"]},
  {dataNetwork: "eip155:3636", graphNetworkId: "botanix-testnet", label: "Botanix Testnet", networkType: "testnet", aliases: ["botanix-testnet", "evm-3636", "spiderchain-testnet", "spiderchain-testnet-v1"]},
  {dataNetwork: "eip155:11142220", graphNetworkId: "celo-sepolia", label: "Celo Sepolia Testnet", networkType: "testnet", aliases: ["celo-sepolia", "evm-11142220"]},
  {dataNetwork: "eip155:88882", graphNetworkId: "chiliz-testnet", label: "Chiliz Spicy Testnet", networkType: "testnet", aliases: ["chiliz-spicy-testnet", "chiliz-testnet", "evm-88882"]},
  {dataNetwork: "eip155:560048", graphNetworkId: "hoodi", label: "Ethereum Hoodi Testnet", networkType: "testnet", aliases: ["evm-560048", "hoodi"]},
  {dataNetwork: "eip155:11155111", graphNetworkId: "sepolia", label: "Ethereum Sepolia Testnet", networkType: "testnet", aliases: ["evm-11155111", "sepolia"]},
  {dataNetwork: "eip155:127823", graphNetworkId: "etherlink-shadownet", label: "Etherlink Shadownet Testnet", networkType: "testnet", aliases: ["etherlink-shadownet", "evm-127823"]},
  {dataNetwork: "eip155:10200", graphNetworkId: "gnosis-chiado", label: "Gnosis Chiado Testnet", networkType: "testnet", aliases: ["chiado", "gnosis-chiado"]},
  {dataNetwork: "eip155:743111", graphNetworkId: "hemi-sepolia", label: "Hemi Sepolia", networkType: "testnet", aliases: ["evm-743111", "hemi-sepolia", "hemi-testnet"]},
  {dataNetwork: "eip155:1439", graphNetworkId: "injective-evm-testnet", label: "Injective EVM Testnet", networkType: "testnet", aliases: ["evm-1439", "injective-evm-testnet"]},
  {dataNetwork: "eip155:10081", graphNetworkId: "joc-testnet", label: "Japan Open Chain Testnet", networkType: "testnet", aliases: ["evm-10081", "joc-testnet"]},
  {dataNetwork: "eip155:1001", graphNetworkId: "kaia-testnet", label: "Kaia Kairos Testnet", networkType: "testnet", aliases: ["evm-1001", "kaia-testnet"]},
  {dataNetwork: "eip155:59141", graphNetworkId: "linea-sepolia", label: "Linea Sepolia Testnet", networkType: "testnet", aliases: ["evm-59141", "linea-sepolia", "linea-testnet", "lineasepolia"]},
  {dataNetwork: "near:testnet", graphNetworkId: "near-testnet", label: "Near Testnet", networkType: "testnet", aliases: ["near-testnet"]},
  {dataNetwork: "eip155:12227332", graphNetworkId: "neox-testnet", label: "Neo X Testnet", networkType: "testnet", aliases: ["evm-12227332", "neox-testnet"]},
  {dataNetwork: "eip155:11155420", graphNetworkId: "optimism-sepolia", label: "OP Sepolia Testnet", networkType: "testnet", aliases: ["op-sepolia", "opsepolia", "optimism-sepolia"]},
  {dataNetwork: "eip155:80002", graphNetworkId: "polygon-amoy", label: "Polygon Amoy Testnet", networkType: "testnet", aliases: ["amoy", "amoy-testnet", "polygon-amoy"]},
  {dataNetwork: "eip155:534351", graphNetworkId: "scroll-sepolia", label: "Scroll Sepolia Testnet", networkType: "testnet", aliases: ["evm-534351", "scroll-sepolia", "scroll-testnet"]},
  {dataNetwork: "eip155:1328", graphNetworkId: "sei-atlantic", label: "Sei Atlantic Testnet", networkType: "testnet", aliases: ["sei-atlantic", "sei-atlantic2", "sei-testnet"]},
  {dataNetwork: "eip155:1946", graphNetworkId: "soneium-testnet", label: "Soneium Minato Testnet", networkType: "testnet", aliases: ["minato", "soneium-minato", "soneium-minato-testnet", "soneium-testnet"]},
  {dataNetwork: "eip155:14601", graphNetworkId: "sonic-testnet", label: "Sonic Testnet", networkType: "testnet", aliases: ["evm-14601", "sonic-testnet"]},
  {dataNetwork: "eip155:42431", graphNetworkId: "tempo-moderato", label: "Tempo Moderato Testnet", networkType: "testnet", aliases: ["evm-42431", "tempo-moderato"]},
  {dataNetwork: "eip155:1301", graphNetworkId: "unichain-testnet", label: "Unichain Sepolia Testnet", networkType: "testnet", aliases: ["evm-1301", "unichain-sepolia", "unichain-testnet"]},
  {dataNetwork: "eip155:195", graphNetworkId: "xlayer-sepolia", label: "X Layer Sepolia Testnet", networkType: "testnet", aliases: ["evm-195", "xlayer-sepolia"]},
  {dataNetwork: "eip155:33101", graphNetworkId: "zilliqa-testnet", label: "Zilliqa 2.0 Testnet", networkType: "testnet", aliases: ["evm-33101", "zilliqa-testnet"]},
  {dataNetwork: "eip155:300", graphNetworkId: "zksync-era-sepolia", label: "zkSync Sepolia Testnet", networkType: "testnet", aliases: ["evm-300", "zksync-era-sepolia", "zksync-sepolia", "zksync-testnet"]},
];

export const graphNetworkAliases: Readonly<Record<string, readonly string[]>> = Object.freeze(
  Object.fromEntries(graphSubgraphNetworkCatalog.map((network) => [
    network.dataNetwork,
    [...new Set([network.graphNetworkId, network.label, ...network.aliases])]
      .filter((alias) => !["mainnet", "testnet"].includes(alias.toLowerCase())),
  ])),
);

export const graphPlannerNetworkCatalog = graphSubgraphNetworkCatalog.map(({dataNetwork, label}) => ({
  dataNetwork,
  label,
}));
