# Privy-to-Hedera Testnet Control Evidence

Date: 2026-09-08

## Scope

This record captures the creator-confirmed development test for the Privy EVM wallet already bound to the Sprue workspace. It contains public testnet identifiers only and no key, token, signature payload, or reusable authorization material.

## Observed Result

| Field | Observed value |
|---|---|
| Network | Hedera testnet |
| Bound Privy EVM address | `0x165bcF3fd12b4d2F13Af8e72a3D3DDE693beB78c` |
| Canonical Hedera account ID | `0.0.10410307` |
| Transaction ID | `0.0.7314364@1788819277.728573279` |
| Transaction type | Ethereum transaction |
| Result | `SUCCESS` |
| Sender account | `0.0.10410307` |
| Relay account | `0.0.7314364` |
| Principal transferred | `0 HBAR` self transaction |
| Charged network fee | `0.02163000 HBAR` |
| Balance observation | `1 HBAR` before; `0.97837 HBAR` after |

Public explorer: [HashScan testnet transaction](https://hashscan.io/testnet/transaction/0.0.7314364@1788819277.728573279)

## Accepted Conclusion

The authenticated creator approved the transaction through Privy, Hedera accepted it, and the mapped account paid the network fee. This demonstrates interactive Privy EVM signing and later access to HBAR held by this complete Hedera testnet account without exporting the creator's private key.

For this tested ECDSA-alias path, Sprue may treat a complete Mirror Node account at the same bound Privy EVM address as verified creator control with HBAR spend capability. A hollow account remains pending.

## Explicit Non-Claims

This evidence does not establish:

- a reviewed general-purpose transfer command;
- delegated or unattended Sprue signing authority;
- Privy policy enforcement for Graph purchasing;
- native Hedera x402 payment signing or Blocky402 settlement;
- receipt of a real buyer payment;
- production or Hedera mainnet compatibility.

