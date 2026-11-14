// The AI settings formatters (redesign 8/9): a context length, a price per million tokens, and money. Pure, so the
// settings page and its tests share them.

export function formatContextLength(tokens: number | null): string | null {
  if (!tokens) return null
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M context`
  return `${Math.round(tokens / 1000)}k context`
}

export function formatPricePerMillion(price: number | null): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null
  const perMillion = price * 1_000_000
  return `$${perMillion.toLocaleString(undefined, { maximumFractionDigits: 4 })}/M`
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount)
}
