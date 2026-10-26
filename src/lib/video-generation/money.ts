/** Convert a decimal USD value to integer micro-dollars, always rounding up. */
export function usdToMicrosCeil(value: number | string): bigint | null {
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match || match[1] === "-") return null;

  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = BigInt(`${match[2]}${fraction}`);
  const decimalPlaces = fraction.length - exponent;
  const numerator = digits * BigInt(1_000_000);
  const denominator = BigInt(10) ** BigInt(Math.max(0, decimalPlaces));
  const adjustedNumerator = decimalPlaces < 0 ? numerator * BigInt(10) ** BigInt(-decimalPlaces) : numerator;
  return (adjustedNumerator + denominator - BigInt(1)) / denominator;
}

/** Multiply a decimal USD-per-unit rate by a positive integer, rounding up to micro-dollars. */
export function usdProductToMicrosCeil(rate: number, units: number): bigint | null {
  if (!Number.isSafeInteger(units) || units <= 0) return null;
  const text = Number.isFinite(rate) ? String(rate) : "";
  const match = /^([+]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;

  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = BigInt(`${match[2]}${fraction}`) * BigInt(units) * BigInt(1_000_000);
  const decimalPlaces = fraction.length - exponent;
  const denominator = BigInt(10) ** BigInt(Math.max(0, decimalPlaces));
  const numerator = decimalPlaces < 0 ? digits * BigInt(10) ** BigInt(-decimalPlaces) : digits;
  return (numerator + denominator - BigInt(1)) / denominator;
}

/** Require confirmation of the exact current server quote; never accept a near-match. */
export function matchesUsdQuoteConfirmation(quote: number, confirmed: number): boolean {
  return Number.isFinite(quote) && quote > 0 && Number.isFinite(confirmed) && quote === confirmed;
}
