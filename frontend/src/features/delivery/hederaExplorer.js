const nativeTransactionId = /^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/;
const canonicalTransactionId = /^(\d+\.\d+\.\d+)@(\d+)\.(\d+)$/;

function normalizeTransactionId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const canonical = canonicalTransactionId.exec(trimmed);
  if (canonical) return `${canonical[1]}@${canonical[2]}.${canonical[3]}`;
  const native = nativeTransactionId.exec(trimmed);
  return native ? `${native[1]}@${native[2]}.${native[3]}` : null;
}

export function hederaTransactionUrl(sale) {
  const transactionId = normalizeTransactionId(
    sale?.networkTransactionId ?? sale?.providerTransactionRef,
  );
  return transactionId
    ? `https://hashscan.io/testnet/transaction/${transactionId}`
    : null;
}
