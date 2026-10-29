export function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function parseMoney(value: unknown): {
  amount: number;
  explicit: boolean;
} | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { amount: value, explicit: true };
  }
  if (value === null || value === undefined)
    return null;
  const original = String(value).trim();
  if (!original)
    return null;
  const negativeByParens = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/[,$£€\s]/g, '').replace(/[()]/g, '').replace(/CAD|USD|CR|DR/gi, '');
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric))
    return null;
  const explicit = /[-+()]/.test(original) || /CR|DR/i.test(original);
  return { amount: negativeByParens ? -Math.abs(numeric) : numeric, explicit };
}

export function parseDate(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '')
    return '';
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact)
    return compact[1] + '-' + compact[2] + '-' + compact[3];
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso)
    return iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
  const slash = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = slash[3].length === 2 ? '20' + slash[3] : slash[3];
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    if (month > 0 && month <= 12 && day > 0 && day <= 31) {
      return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()))
    return parsed.toISOString().slice(0, 10);
  return '';
}

export function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function formatMoney(amount: number, currency = 'CAD'): string {
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2 }).format(amount);
  }
  catch {
    return '$' + amount.toFixed(2);
  }
}

export function formatDate(date: string): string {
  if (!date)
    return '—';
  const parsed = new Date(date + 'T12:00:00');
  if (Number.isNaN(parsed.getTime()))
    return date;
  return parsed.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}
