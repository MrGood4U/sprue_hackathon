export const TINYBARS_PER_HBAR = 100_000_000n;

export function hbarToTinybars(value: string): bigint {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))?$/.exec(value.trim());
  if (!match) throw new Error("HBAR amounts must be non-negative decimals with at most 8 fractional digits.");
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(8, "0") || "0");
  return whole * TINYBARS_PER_HBAR + fraction;
}

export function tinybarsToHbar(value: bigint | string): string {
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  const sign = atomic < 0n ? "-" : "";
  const absolute = atomic < 0n ? -atomic : atomic;
  const whole = absolute / TINYBARS_PER_HBAR;
  const fraction = (absolute % TINYBARS_PER_HBAR).toString().padStart(8, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}
