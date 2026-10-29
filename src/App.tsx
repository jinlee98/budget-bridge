import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';

type AccountKind = 'bank' | 'card';
type Institution = 'TD' | 'Scotiabank' | 'Tangerine' | 'American Express' | 'Other';
type CategorySource = 'Rule' | 'Manual' | 'Uncategorized';
type IncomeCategory = 'Savings' | 'Paycheck' | 'Bonus' | 'Interest' | 'Other' | 'Refunds';

type RawTransaction = {
  date: string;
  postedDate: string;
  description: string;
  amount: number;
  currency: string;
  externalId: string;
  hasExplicitSign: boolean;
  signNormalized?: boolean;
};

type ImportBatch = {
  id: string;
  fileName: string;
  institution: Institution;
  accountKind: AccountKind;
  currency: string;
  rows: RawTransaction[];
  skipped: number;
  format: 'CSV' | 'QFX / OFX';
  detectionNote?: string;
};

type Transaction = RawTransaction & {
  accountKind?: AccountKind;
  id: string;
  importKey: string;
  institution: Institution;
  accountName: string;
  category: string;
  incomeCategory?: IncomeCategory;
  categorySource: CategorySource;
  fileName: string;
  shared: boolean;
  splitCount: number;
};

type GoogleWindow = Window & {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (options: {
          client_id: string;
          scope: string;
          callback: (response: { access_token?: string; error?: string }) => void;
        }) => { requestAccessToken: (options?: { prompt?: string }) => void };
      };
    };
  };
};

declare const window: GoogleWindow;

const STORAGE = {
  transactions: 'morrow.transactions.v1',
  clientId: 'morrow.google.clientId',
  sheetUrl: 'morrow.google.sheetUrl',
  tabName: 'morrow.google.tabName',
  rules: 'morrow.categoryRules.v1',
  startingBalance: 'morrow.budget.startingBalance',
  expensePlan: 'morrow.budget.expensePlan',
  incomePlan: 'morrow.budget.incomePlan',
};

const HEADERS = [
  'Date', 'Posted Date', 'Description', 'Amount', 'Currency',
  'Account', 'Bank', 'Category', 'Categorization', 'Shared',
  'People (incl. me)', 'Each person', 'Others owe', 'Import Key',
];

const DEFAULT_EXPENSE_PLANS = [
  'Food', 'Gifts', 'Health/medical', 'Home',
  'Transportation', 'Personal', 'Pets', 'Utilities', 'Travel', 'Debt',
  'Other',
];
const DEFAULT_INCOME_PLANS = [
  'Paycheck', 'Bonus', 'Interest', 'Other',
] as const;
const INCOME_CATEGORIES = [...DEFAULT_INCOME_PLANS, 'Refunds'] as const;
const GOOGLE_MONTHLY_BUDGET_TEMPLATE =
  'https://docs.google.com/spreadsheets/d/1X4qtICR-4SztmMrQv2Xogf7bVV46QVzLxO7X8ie9yU4/copy';
const SHARED_EXPENSE_HEADERS = [
  'Date', 'Description', 'Category', 'Full amount', 'People (incl. me)',
  'Each person', 'Others owe', 'Account', 'Bank', 'Import Key',
];

const CATEGORIES = [
  'Food / Groceries', 'Gifts', 'Health/medical', 'Home', 'Transportation', 'Personal',
  'Pets', 'Utilities', 'Travel', 'Debt', 'Other', 'Income',
];
const BOOKKEEPING_CATEGORIES = ['Card payments', 'Savings transfers', 'Investments', 'Transfers & Payments'];

const LEGACY_CATEGORIES: Record<string, string> = {
  'Food': 'Food / Groceries', 'Groceries': 'Food / Groceries', 'Restaurants & Coffee': 'Personal',
  'Bills & Utilities': 'Utilities', 'Housing': 'Home',
  'Shopping': 'Personal', 'Subscriptions': 'Personal',
  'Health': 'Health/medical', 'Entertainment': 'Personal',
  'Savings & Investments': 'Investments', 'Fees & Interest': 'Debt',
  'Savings': 'Savings transfers', 'Income:Savings': 'Savings transfers',
};

const CATEGORY_RULES: { category: string; pattern: RegExp }[] = [
  { category: 'Transfers & Payments', pattern: /\b(credit card payment|payment thank you|payment received|visa payment|mastercard payment|mc payment|amex payment|american express payment|payment to amex|payment to american express|payment to card|online banking transfer|account transfer|interac e transfer|e transfer|etransfer)\b/ },
  { category: 'Investments', pattern: /\b(investment|investments|investing|questrade|wealthsimple|tfsa|fhsa|rrsp|brokerage)\b/ },
  { category: 'Debt', pattern: /\b(loan|loans|student loan|line of credit|loc payment|debt|mortgage|interest charged|interest charge|finance charge|annual fee|bank fee|overdraft fee)\b/ },
  { category: 'Travel', pattern: /\b(travel|hotel|hotels|motel|resort|airbnb|vrbo|flight|flights|airline|airlines|airways|air canada|westjet|porter|flair|air transat|lufthansa|expedia|booking com|hilton|marriott|hyatt|fairmont)\b/ },
  { category: 'Pets', pattern: /\b(pet|pets|petco|petsmart|pet valu|veterinary|veterinarian|vet clinic)\b/ },
  { category: 'Health/medical', pattern: /\b(health|medical|dental|dentist|pharmacy|physiotherapy|physio|optometrist|hospital|clinic|shoppers drug mart|london drugs)\b/ },
  { category: 'Utilities', pattern: /\b(telus|rogers|bell canada|fido|koodo|freedom mobile|shaw|fortisbc|bc hydro|hydro|utility|utilities|internet|electricity|water bill)\b/ },
  { category: 'Home', pattern: /\b(rent|rental payment|strata|home depot|home hardware|ikea|property tax|home insurance)\b/ },
  { category: 'Gifts', pattern: /\b(gift|gifts|florist|flowers|donation|charity)\b/ },
  { category: 'Personal', pattern: /\b(game|games|gaming|gamestop|steam|steampowered|valve|nintendo|playstation|xbox|epic games|riot games|blizzard|ubisoft|electronic arts|ea games)\b/ },
  { category: 'Food / Groceries', pattern: /\b(grocery|groceries|supermarket|save on foods|t t supermarket|whole foods|costco|safeway|sobeys|loblaws|superstore|no frills|walmart grocery|freshco|farm boy)\b/ },
  { category: 'Personal', pattern: /\b(amazon|amzn|walmart|target|dollarama|dollar tree|canadian tire|best buy|winners|homesense|uniqlo|sephora|store|stores|shopping|retail|restaurant|restaurants|cafe|cafes|coffee|starbucks|tim hortons|mcdonalds|mcdonald s|uber eats|ubereats|doordash|skip the dishes|skipthedishes|a w|subway|pizza|sushi|bakery|bistro|grill|kitchen|diner|bar|pub|spotify|netflix|disney|amazon prime|apple com bill)\b/ },
  { category: 'Transportation', pattern: /\b(shell|chevron|esso|petro canada|translink|compass card|uber|lyft|taxi|parking|impark|easypark|transit|gas station|icbc)\b/ },
];

const TRANSFER_CATEGORIES = new Set([...BOOKKEEPING_CATEGORIES, 'Savings & Investments']);
const BANKS: Institution[] = ['TD', 'Scotiabank', 'Tangerine', 'American Express', 'Other'];

function getStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function inferInstitution(fileName: string): Institution {
  const value = fileName.toLowerCase();
  if (value.includes('tangerine')) return 'Tangerine';
  if (value.includes('scotia')) return 'Scotiabank';
  if (/amex|american[\s_-]*express/.test(value)) return 'American Express';
  if (/(^|[^a-z])td([^a-z]|$)|toronto[\s_-]*dominion/.test(value)) return 'TD';
  return 'Other';
}

function inferAccountKind(institution: Institution): AccountKind {
  return institution === 'American Express' ? 'card' : 'bank';
}

function inspectCsv(text: string) {
  let fallback: string[][] = [];
  // Uneven metadata rows can confuse automatic delimiter detection.
  for (const delimiter of ['', ',', ';', '\t', '|']) {
    const grid = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimiter }).data;
    if (!delimiter) fallback = grid;
    const headerIndex = grid.slice(0, 50).findIndex((row) => {
      const cells = row.map(normalizeText);
      return cells.some((cell) => /^(transaction date|trans date|date|activity date|transactiondate)$/.test(cell)) &&
        cells.some((cell) => /^(description|transaction description|merchant|details|payee|name|memo|transaction)$/.test(cell)) &&
        cells.some((cell) => /^(amount|transaction amount|net amount|value|total|debit|withdrawal|money out|debit amount|charge|credit|deposit|money in|credit amount|payment)$/.test(cell));
    });
    if (headerIndex >= 0) return { grid, headerIndex };
  }
  return { grid: fallback, headerIndex: 0 };
}

function detectImportSource(text: string, fileName: string, isOfx: boolean) {
  let metadata: string[];
  let headers: string[] = [];
  if (isOfx) {
    // Read account/issuer metadata, never merchant names in transaction blocks.
    const prefix = text.split(/<STMTTRN>/i)[0];
    metadata = [...prefix.matchAll(/<(?:ORG|BANKNAME|ACCTTYPE)>([^<\r\n]+)/gi)].map((match) => match[1]);
    if (/<CCACCTFROM>|<CCSTMTRS>/i.test(prefix)) metadata.push('credit card');
    else if (/<BANKACCTFROM>/i.test(prefix)) metadata.push('bank account');
  } else {
    const { grid, headerIndex } = inspectCsv(text);
    headers = grid[headerIndex] ?? [];
    metadata = grid.slice(0, headerIndex).flat();
    const metadataColumns = headers.map((header, index) =>
      /^(bank|bank name|institution|financial institution|account type|account name|card type|product|product name)$/.test(normalizeText(header)) ? index : -1,
    ).filter((index) => index >= 0);
    for (const row of grid.slice(headerIndex + 1)) {
      for (const column of metadataColumns) if (row[column]) metadata.push(row[column]);
    }
  }
  const banks = [...new Set(metadata.map(inferInstitution).filter((bank) => bank !== 'Other'))];
  const institution = banks.length === 1 ? banks[0] : banks.length > 1 ? 'Other' : inferInstitution(fileName);
  const accountSignals = metadata.join(' ').toLowerCase();
  const cardSignal = /\b(credit card|visa|mastercard|amex|american express|cobalt)\b/.test(accountSignals) ||
    headers.some((header) => /^(card number|card member|cardmember|cardmember name|credit card number)$/.test(normalizeText(header)));
  const bankSignal = /\b(chequing|checking|savings|bank account|current account|money market)\b/.test(accountSignals);
  const fileCard = /\b(card|visa|mastercard|amex|cobalt)\b/.test(normalizeText(fileName));
  const fileBank = /\b(chequing|checking|savings)\b/.test(normalizeText(fileName));
  const accountKind: AccountKind = cardSignal !== bankSignal ? (cardSignal ? 'card' : 'bank')
    : !cardSignal && fileCard !== fileBank ? (fileCard ? 'card' : 'bank') : inferAccountKind(institution);
  const bankEvidence = banks.length === 1 ? 'Bank from file contents' : banks.length > 1 ? 'Conflicting banks; choose bank' : institution !== 'Other' ? 'Bank from filename' : 'Bank not detected';
  const typeEvidence = cardSignal !== bankSignal ? 'account type from file contents' : cardSignal ? 'conflicting account types; confirm selection'
    : fileCard !== fileBank ? 'account type from filename' : institution === 'American Express' ? 'credit card assumed for Amex' : 'account type not detected; confirm selection';
  return { institution, accountKind, detectionNote: bankEvidence + '; ' + typeEvidence + '.' };
}

function findHeader(headers: string[], choices: string[]): string | undefined {
  const normalized = headers.map((header) => ({
    original: header,
    simple: header.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));
  for (const choice of choices) {
    const wanted = choice.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = normalized.find((item) => item.simple === wanted);
    if (exact) return exact.original;
  }
  for (const choice of choices) {
    const wanted = choice.toLowerCase().replace(/[^a-z0-9]/g, '');
    const partial = normalized.find((item) => item.simple && item.simple.includes(wanted));
    if (partial) return partial.original;
  }
  return undefined;
}

function parseMoney(value: unknown): { amount: number; explicit: boolean } | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { amount: value, explicit: true };
  }
  if (value === null || value === undefined) return null;
  const original = String(value).trim();
  if (!original) return null;
  const negativeByParens = /^\(.*\)$/.test(original);
  const cleaned = original.replace(/[,$£€\s]/g, '').replace(/[()]/g, '').replace(/CAD|USD|CR|DR/gi, '');
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return null;
  const explicit = /[-+()]/.test(original) || /CR|DR/i.test(original);
  return { amount: negativeByParens ? -Math.abs(numeric) : numeric, explicit };
}

function parseDate(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return compact[1] + '-' + compact[2] + '-' + compact[3];
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return iso[1] + '-' + iso[2].padStart(2, '0') + '-' + iso[3].padStart(2, '0');
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
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function parseCsvText(text: string): { rows: RawTransaction[]; skipped: number } {
  const { grid, headerIndex } = inspectCsv(text);
  const parsed = Papa.parse<Record<string, string>>(Papa.unparse(grid.slice(headerIndex)), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const dateHeader = findHeader(headers, ['transaction date', 'trans date', 'date', 'activity date', 'transactiondate']);
  const postedHeader = findHeader(headers, ['posted date', 'posting date', 'date posted', 'post date']);
  const descriptionHeader = findHeader(headers, ['description', 'transaction description', 'merchant', 'details', 'payee', 'name', 'memo', 'transaction']);
  const amountHeader = findHeader(headers, ['amount', 'transaction amount', 'net amount', 'value', 'total']);
  const debitHeader = findHeader(headers, ['debit', 'withdrawal', 'money out', 'debit amount', 'charge']);
  const creditHeader = findHeader(headers, ['credit', 'deposit', 'money in', 'credit amount', 'payment']);
  const currencyHeader = findHeader(headers, ['currency', 'currency code']);
  const idHeader = findHeader(headers, ['transaction id', 'reference number', 'fitid', 'confirmation number', 'id']);
  const accountHeader = findHeader(headers, ['account name', 'account', 'account number']);
  const rows: RawTransaction[] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    const date = parseDate(dateHeader ? row[dateHeader] : '');
    const description = String(descriptionHeader ? row[descriptionHeader] ?? '' : '').trim();
    const debitValue = debitHeader ? parseMoney(row[debitHeader]) : null;
    const creditValue = creditHeader ? parseMoney(row[creditHeader]) : null;
    let amount: number | null = null;
    let hasExplicitSign = false;
    if (debitHeader || creditHeader) {
      if (!debitValue && !creditValue) {
        skipped += 1;
        continue;
      }
      const debit = debitValue?.amount ?? 0;
      const credit = creditValue?.amount ?? 0;
      amount = credit - debit;
      hasExplicitSign = true;
    } else if (amountHeader) {
      const parsedAmount = parseMoney(row[amountHeader]);
      amount = parsedAmount?.amount ?? null;
      hasExplicitSign = parsedAmount?.explicit ?? false;
    }
    if (!date || !description || amount === null) {
      skipped += 1;
      continue;
    }
    rows.push({
      date,
      postedDate: parseDate(postedHeader ? row[postedHeader] : ''),
      description,
      amount: Math.round(amount * 100) / 100,
      currency: String(currencyHeader ? row[currencyHeader] ?? '' : '').trim().toUpperCase(),
      externalId: String(idHeader ? row[idHeader] ?? '' : '').trim(),
      hasExplicitSign,
      signNormalized: Boolean(debitHeader || creditHeader),
    });
    if (accountHeader && !row[accountHeader]) {
      // Account labels can be set once for the whole file in the import review.
    }
  }
  return { rows, skipped };
}

function parseOfx(text: string): { rows: RawTransaction[]; skipped: number; currency: string; account: string } {
  const rows: RawTransaction[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRN>|<\/STMTTRNRS>|$)/gi) ?? [];
  const getField = (block: string, name: string) => {
    const match = block.match(new RegExp('<' + name + '>([^<\\r\\n]+)', 'i'));
    return match?.[1]?.trim() ?? '';
  };
  for (const block of blocks) {
    const date = parseDate(getField(block, 'DTPOSTED'));
    const parsedAmount = parseMoney(getField(block, 'TRNAMT'));
    const description = getField(block, 'NAME') || getField(block, 'MEMO') || getField(block, 'PAYEE');
    if (!date || !description || !parsedAmount) continue;
    rows.push({
      date,
      postedDate: '',
      description,
      amount: Math.round(parsedAmount.amount * 100) / 100,
      currency: '',
      externalId: getField(block, 'FITID'),
      hasExplicitSign: true,
    });
  }
  return {
    rows,
    skipped: Math.max(0, blocks.length - rows.length),
    currency: getField(text, 'CURDEF').toUpperCase(),
    account: getField(text, 'ACCTID'),
  };
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function transactionKey(transaction: Pick<Transaction, 'date' | 'postedDate' | 'description' | 'amount' | 'currency' | 'accountName' | 'institution' | 'externalId'>): string {
  if (transaction.externalId) {
    return hashString([transaction.institution, transaction.accountName, transaction.externalId].join('|'));
  }
  return hashString([
    transaction.institution,
    transaction.accountName,
    transaction.date,
    transaction.postedDate,
    normalizeText(transaction.description),
    transaction.amount.toFixed(2),
    transaction.currency,
  ].join('|'));
}

function sheetCategory(category: string): string {
  return LEGACY_CATEGORIES[category] ?? category;
}

function migrateBookkeeping(item: Transaction): Transaction {
  const category = item.category === 'Income' && item.incomeCategory === 'Savings' ? 'Savings transfers' : sheetCategory(item.category);
  if (category === item.category && !(TRANSFER_CATEGORIES.has(category) && (item.shared || item.incomeCategory))) return item;
  return { ...item, category, incomeCategory: category === 'Income' ? item.incomeCategory : undefined,
    shared: TRANSFER_CATEGORIES.has(category) ? false : item.shared };
}

function merchantKey(description: string): string {
  return normalizeText(description)
    .replace(/^(pos|purchase|debit purchase|visa purchase|mastercard purchase)\s+/, '')
    .replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
}

function isGenericDescription(description: string): boolean {
  return /^(withdrawal|deposit|abm deposit|miscellaneous payment|bill payment|customer transfer(?: dr| cr)?|payment from(?: \d+)?)$/.test(normalizeText(description));
}

function inferIncomeCategory(description: string): IncomeCategory {
  const text = normalizeText(description);
  if (!/\btax refund\b/.test(text) && /\b(refund|refunds|purchase reversal|return credit)\b/.test(text)) return 'Refunds';
  if (/\b(bonus|incentive)\b/.test(text)) return 'Bonus';
  if (/\b(interest)\b/.test(text)) return 'Interest';
  if (/\b(payroll|paycheque|paycheck|salary|wages)\b/.test(text)) return 'Paycheck';
  return 'Other';
}

function categorySelection(item: Pick<Transaction, 'category' | 'incomeCategory' | 'description'>): string {
  if (item.category === 'Income' && item.incomeCategory === 'Savings') return 'Savings transfers';
  return item.category === 'Income' ? 'Income:' + (item.incomeCategory ?? inferIncomeCategory(item.description)) : item.category;
}

function parseCategorySelection(value: string): { category: string; incomeCategory?: IncomeCategory } {
  if (value.startsWith('Income:') && INCOME_CATEGORIES.some((category) => category === value.slice(7))) {
    return { category: 'Income', incomeCategory: value.slice(7) as IncomeCategory };
  }
  return { category: sheetCategory(value), incomeCategory: undefined };
}

function categoryLabel(item: Pick<Transaction, 'category' | 'incomeCategory' | 'description'>): string {
  return categorySelection(item).replace('Income:', 'Income / ');
}

function categorize(description: string, rules: Record<string, string>, amount: number, accountKind?: AccountKind): { category: string; incomeCategory?: IncomeCategory; source: CategorySource } {
  const text = normalizeText(description);
  const learned = isGenericDescription(description) ? undefined : rules[text] ?? rules['merchant:' + merchantKey(description)];
  if (learned) {
    const selection = parseCategorySelection(learned);
    // A merchant's purchase category must not override a credit-card refund.
    if (!(accountKind === 'card' && amount > 0 && selection.category !== 'Income' && !TRANSFER_CATEGORIES.has(selection.category))) {
      return { ...selection, incomeCategory: selection.category === 'Income' ? selection.incomeCategory ?? inferIncomeCategory(description) : undefined, source: 'Rule' };
    }
  }
  // Transfers take precedence over merchants (e.g. a card payment to a retailer).
  const cardName = /\b(visa|mastercard|master card|amex|american express|credit card|creditcard)\b/.test(text);
  const payment = /\b(payment|payments|pmt|pymt|thank you|thankyou|bill pay)\b/.test(text);
  const financingCharge = /\b(interest|fee|fees|finance charge)\b/.test(text);
  const ownSavingsTransfer = /\b(transfer|tfr|xfer|trf)\b/.test(text) && /\b(savings|chequing|checking|own account|between accounts)\b/.test(text);
  const issuerOnlyBankDebit = accountKind === 'bank' && amount < 0 && /^(amex|american express|(?:td|scotia|scotiabank|tangerine|cibc|rbc|bmo) (?:visa|mastercard|master card))(?: \d+)?$/.test(text);
  const explicitCardBill = /\b(crd card bill payment|creditcard pmt)\b/.test(text);
  const cardPaymentFrom = accountKind === 'card' && amount > 0 && /^payment from\b/.test(text);
  const cardPaymentCredit = accountKind === 'card' && amount > 0 && payment && !/\b(refund|reversal|reversed)\b/.test(text);
  if (!financingCharge && ((cardName && payment) || issuerOnlyBankDebit || explicitCardBill || cardPaymentFrom || cardPaymentCredit || /\b(payment thank you|payment received)\b/.test(text))) {
    return { category: 'Card payments', source: 'Rule' };
  }
  if (ownSavingsTransfer) return { category: /\bsavings\b/.test(text) ? 'Savings transfers' : 'Transfers & Payments', source: 'Rule' };
  if (CATEGORY_RULES[0].pattern.test(text)) return { category: 'Transfers & Payments', source: 'Rule' };
  if (accountKind === 'card' && amount > 0) {
    return { category: 'Income', incomeCategory: 'Refunds', source: 'Rule' };
  }
  if (amount > 0 && /\b(payroll|paycheque|paycheck|salary|wages|bonus|interest earned|interest paid|interest income|dividend|dividends|tax refund)\b/.test(text)) {
    return { category: 'Income', incomeCategory: inferIncomeCategory(description), source: 'Rule' };
  }
  if (amount > 0 && /\b(loan proceeds|loan advance|loan disbursement)\b/.test(text)) {
    return { category: 'Transfers & Payments', source: 'Rule' };
  }
  if (amount > 0 && inferIncomeCategory(description) === 'Refunds') {
    return { category: 'Income', incomeCategory: 'Refunds', source: 'Rule' };
  }
  const match = CATEGORY_RULES.slice(1).find((rule) => rule.pattern.test(text));
  if (match) return { category: match.category, source: 'Rule' };
  return { category: 'Uncategorized', source: 'Uncategorized' };
}

function transactionAccountKind(item: Transaction): AccountKind {
  return item.accountKind ?? (/\bcard\b/i.test(item.accountName) ? 'card' : inferAccountKind(item.institution));
}

function refreshSuggestions(transactions: Transaction[], rules: Record<string, string>): Transaction[] {
  return transactions.map((item) => {
    if (item.categorySource === 'Manual') return item;
    const suggestion = categorize(item.description, rules, item.amount, transactionAccountKind(item));
    return {
      ...item, category: suggestion.category, incomeCategory: suggestion.incomeCategory, categorySource: suggestion.source,
      shared: item.shared && item.amount < 0 && suggestion.category !== 'Income' && !TRANSFER_CATEGORIES.has(suggestion.category),
    };
  });
}

function currentCategory(item: Transaction, rules: Record<string, string>): string {
  if (item.category === 'Income' && item.incomeCategory === 'Savings') return 'Savings transfers';
  if (item.categorySource === 'Manual' || TRANSFER_CATEGORIES.has(item.category)) return sheetCategory(item.category);
  const suggestion = categorize(item.description, rules, item.amount, transactionAccountKind(item)).category;
  return sheetCategory(suggestion === 'Uncategorized' ? item.category : suggestion);
}

function reconcileTransfers(transactions: Transaction[], rules: Record<string, string>): Transaction[] {
  const rows = transactions.map((item) => {
    item = migrateBookkeeping(item);
    if (item.categorySource === 'Manual') return item;
    const accountKind = transactionAccountKind(item);
    const suggestion = categorize(item.description, rules, item.amount, accountKind);
    if (suggestion.category === 'Uncategorized' && !isGenericDescription(item.description)) return item;
    return { ...item, category: suggestion.category, incomeCategory: suggestion.incomeCategory, categorySource: suggestion.source };
  });
  const candidates = new Map<number, Set<number>>();
  const canMatch = (item: Transaction) => TRANSFER_CATEGORIES.has(item.category) ||
    (item.categorySource !== 'Manual' && (isGenericDescription(item.description) || normalizeText(item.description) === 'scotiabank transit'));
  for (let i = 0; i < rows.length; i += 1) {
    const seed = rows[i];
    if (!TRANSFER_CATEGORIES.has(seed.category) || seed.amount === 0) continue;
    for (let j = 0; j < rows.length; j += 1) {
      const other = rows[j];
      if (i === j || !canMatch(other) || (seed.institution === other.institution && seed.accountName === other.accountName)) continue;
      if ((seed.currency || 'CAD') !== (other.currency || 'CAD') || Math.round(seed.amount * 100) !== -Math.round(other.amount * 100)) continue;
      const gap = Math.abs(Date.parse(seed.date) - Date.parse(other.date));
      if (!Number.isFinite(gap) || gap > 3 * 86400000) continue;
      if (!candidates.has(i)) candidates.set(i, new Set());
      if (!candidates.has(j)) candidates.set(j, new Set());
      candidates.get(i)!.add(j);
      candidates.get(j)!.add(i);
    }
  }
  // Match only unique pairs, supported by an explicit payment/transfer on one side.
  return rows.map((item, index) => {
    const matches = candidates.get(index);
    const partner = matches?.size === 1 ? [...matches][0] : undefined;
    if (partner === undefined || candidates.get(partner)?.size !== 1 || item.categorySource === 'Manual') return item;
    const partnerCategory = rows[partner].category;
    const category = item.category === 'Card payments' || partnerCategory === 'Card payments' ? 'Card payments'
      : item.category === 'Savings transfers' || partnerCategory === 'Savings transfers' ? 'Savings transfers'
      : item.category === 'Investments' || partnerCategory === 'Investments' ? 'Investments' : 'Transfers & Payments';
    return { ...item, category, incomeCategory: undefined, categorySource: 'Rule', shared: false };
  });
}

function budgetImpact(item: Transaction, rules: Record<string, string>): string {
  const category = currentCategory(item, rules);
  if (category === 'Income' && (item.incomeCategory ?? inferIncomeCategory(item.description)) === 'Refunds') return item.amount >= 0 ? 'Reduces spending · refund' : 'Spending · refund reversal';
  if (category === 'Income') return 'Income · not spending';
  if (TRANSFER_CATEGORIES.has(category)) return 'Excluded · transfer / investment';
  if (category === 'Uncategorized') return item.amount < 0 ? 'Included · needs review' : 'Excluded · unknown deposit';
  return item.amount < 0 ? 'Spending' : 'Reduces spending';
}

function budgetRowKey(kind: 'expense' | 'income', date: string, amount: number, description: string): string {
  return hashString([kind, date, amount.toFixed(2), normalizeText(description)].join('|'));
}

function categoryGroup(category: string): 'expense' | 'income' | 'bookkeeping' | 'uncategorized' {
  if (category === 'group:expense') return 'expense';
  if (category === 'group:income') return 'income';
  if (category === 'group:bookkeeping') return 'bookkeeping';
  if (category === 'Uncategorized') return 'uncategorized';
  if (category === 'Income' || category.startsWith('Income:')) return 'income';
  return TRANSFER_CATEGORIES.has(category) || category === 'All categories'
    ? 'bookkeeping' : 'expense';
}

function matchesCategoryFilter(item: Transaction, filter: string): boolean {
  if (filter.startsWith('group:')) return categoryGroup(item.category) === filter.slice(6);
  return filter === 'All categories' || item.category === filter || categorySelection(item) === filter;
}

function transactionsForMonth<T extends { date: string }>(rows: T[], month: string): T[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return rows.filter((item) => item.date.slice(0, 7) === month);
}

function summarizeSpending(transactions: Transaction[], month: string, rules: Record<string, string>) {
  const groups = new Map<string, { currency: string; charges: number; refunds: number; income: number; unknownCredits: number; pending: number; excluded: number; categories: Record<string, number>; largestCharges: { id: string; description: string; amount: number; category: string }[] }>();
  if (!/^\d{4}-\d{2}$/.test(month)) return [];
  for (const item of reconcileTransfers(transactions, rules)) {
    if (item.date.slice(0, 7) !== month || !Number.isFinite(item.amount)) continue;
    const currency = item.currency || 'CAD';
    let group = groups.get(currency);
    if (!group) {
      group = { currency, charges: 0, refunds: 0, income: 0, unknownCredits: 0, pending: 0, excluded: 0, categories: {}, largestCharges: [] };
      groups.set(currency, group);
    }
    // Refresh automatic classifications for the total without editing saved rows.
    const category = currentCategory(item, rules);
    const isRefund = category === 'Income' && (item.incomeCategory ?? inferIncomeCategory(item.description)) === 'Refunds';
    if (category === 'Income' && !isRefund) group.income += Math.round(item.amount * 100);
    if ((category === 'Income' && !isRefund) || TRANSFER_CATEGORIES.has(category)) {
      group.excluded += 1;
      continue;
    }
    const cents = Math.round(item.amount * 100);
    if (cents < 0) {
      group.charges -= cents;
      group.largestCharges.push({ id: item.id, description: item.description, amount: -cents / 100, category });
    }
    // An unknown deposit might be income or a transfer, not an expense refund.
    else if (category !== 'Uncategorized') group.refunds += cents;
    if (category === 'Uncategorized') {
      if (cents < 0) group.pending -= cents;
      else group.unknownCredits += cents;
    } else {
      const label = isRefund ? 'Refunds' : category;
      group.categories[label] = (group.categories[label] ?? 0) - cents;
    }
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency)).map((group) => ({
    currency: group.currency, charges: group.charges / 100, refunds: group.refunds / 100,
    net: (group.charges - group.refunds) / 100, pending: group.pending / 100, excluded: group.excluded,
    income: group.income / 100, remaining: (group.income - group.charges + group.refunds) / 100,
    unknownCredits: group.unknownCredits / 100,
    largestCharges: group.largestCharges.sort((a, b) => b.amount - a.amount).slice(0, 5),
    categories: Object.entries(group.categories).map(([category, cents]) => ({ category, amount: cents / 100 }))
      .sort((a, b) => b.amount - a.amount),
  }));
}

function extractSheetId(urlOrId: string): string {
  const text = urlOrId.trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? text;
}

function templateCategory(category: string, description: string, incomeCategories: string[], incomeCategory?: IncomeCategory, expenseCategories: string[] = []): string {
  if (category === 'Income') {
    if (incomeCategory === 'Refunds' || (!incomeCategory && inferIncomeCategory(description) === 'Refunds')) return incomeCategories.includes('Refunds') ? 'Refunds' : 'Other';
    if (incomeCategory) return incomeCategory;
    const inferred = inferIncomeCategory(description);
    if (incomeCategories.includes(inferred)) return inferred;
    return incomeCategories.includes('Other') ? 'Other' : (incomeCategories[0] ?? 'Other');
  }
  if (sheetCategory(category) === 'Food / Groceries') return expenseCategories.find((label) => normalizeText(sheetCategory(label)) === normalizeText('Food / Groceries')) ?? 'Food / Groceries';
  return category === 'Uncategorized' ? 'Other' : sheetCategory(category);
}

type TransactionSection = {
  kind: 'expense' | 'income';
  headerRow: number;
  columns: { date: number; amount: number; description: number; category: number };
  left: number;
  right: number;
};

function discoverTransactionSections(grid: string[][]): TransactionSection[] {
  for (let rowIndex = 0; rowIndex < Math.min(grid.length, 20); rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    const normalized = row.map((value) => normalizeText(String(value ?? '')));
    const labels = {
      date: normalized.map((value, index) => value === 'date' ? index : -1).filter((index) => index >= 0),
      amount: normalized.map((value, index) => value === 'amount' ? index : -1).filter((index) => index >= 0),
      description: normalized.map((value, index) => ['description', 'details', 'transaction'].includes(value) ? index : -1).filter((index) => index >= 0),
      category: normalized.map((value, index) => value === 'category' ? index : -1).filter((index) => index >= 0),
    };
    if (!labels.date.length || !labels.amount.length || !labels.description.length || !labels.category.length) continue;
    const all = [
      ...labels.date.map((col) => ({ field: 'date' as const, col })),
      ...labels.amount.map((col) => ({ field: 'amount' as const, col })),
      ...labels.description.map((col) => ({ field: 'description' as const, col })),
      ...labels.category.map((col) => ({ field: 'category' as const, col })),
    ].sort((a, b) => a.col - b.col);
    const clusters: typeof all[] = [];
    for (const item of all) {
      const cluster = clusters[clusters.length - 1];
      if (!cluster || item.col - cluster[cluster.length - 1].col > 1) clusters.push([item]);
      else cluster.push(item);
    }
    const complete = clusters.map((cluster) => {
      const fields: Partial<TransactionSection['columns']> = {};
      for (const item of cluster) {
        if (fields[item.field] === undefined) fields[item.field] = item.col;
      }
      if (fields.date === undefined || fields.amount === undefined || fields.description === undefined || fields.category === undefined) return null;
      return {
        headerRow: rowIndex,
        columns: fields as TransactionSection['columns'],
        left: Math.min(fields.date, fields.amount, fields.description, fields.category),
        right: Math.max(fields.date, fields.amount, fields.description, fields.category),
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
    if (complete.length) {
      return complete.map((section, index) => ({
        ...section,
        kind: complete.length > 1 ? (index === 0 ? 'expense' : 'income') : 'expense',
      }));
    }
  }
  return [];
}

type SummaryGrid = (string | number)[][];

function findFoodCategoryRepairs(grid: string[][], sections: TransactionSection[], month: string, foodCategory: string) {
  const repairs: { range: string; values: unknown[][] }[] = [];
  for (const section of sections.filter((entry) => entry.kind === 'expense')) {
    for (let r = section.headerRow + 1; r < grid.length; r += 1) {
      const row = grid[r] ?? [];
      const category = String(row[section.columns.category] ?? '').trim();
      if (normalizeText(category) === 'food' && foodCategory !== category && parseDate(row[section.columns.date]).slice(0, 7) === month) {
        repairs.push({ range: 'Transactions!' + columnName(section.columns.category) + (r + 1), values: [[foodCategory]] });
      }
    }
  }
  return repairs;
}
type SheetMerge = { startRowIndex: number; endRowIndex: number; startColumnIndex: number; endColumnIndex: number };
type SummaryLayout = {
  startingBalanceCell: string;
  expense: { firstRow: number; lastRow: number; labelCol: number; plannedCol: number };
  income: { firstRow: number; lastRow: number; labelCol: number; plannedCol: number };
};
// One-based row numbers; zero-based columns. Confirmed for the linked template.
const SUMMARY_LAYOUT: SummaryLayout = {
  startingBalanceCell: 'L8',
  expense: { firstRow: 28, lastRow: 38, labelCol: 1, plannedCol: 3 },
  income: { firstRow: 28, lastRow: 33, labelCol: 7, plannedCol: 9 },
};

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

function discoverSummarySections(grid: SummaryGrid, layout?: SummaryLayout) {
  const sections: { kind: 'expense' | 'income'; headerRow: number; labelCol: number; plannedCol: number; endRow: number }[] = [];
  if (layout) return (['expense', 'income'] as const).map((kind) => ({
    kind, headerRow: layout[kind].firstRow - 2, endRow: layout[kind].lastRow,
    labelCol: layout[kind].labelCol, plannedCol: layout[kind].plannedCol,
  }));
  for (let t = 0; t < grid.length; t += 1) {
    const titles = (grid[t] ?? []).map((cell) => normalizeText(String(cell)));
    for (let c = 0; c < titles.length; c += 1) {
      if (titles[c] !== 'expenses' && titles[c] !== 'income') continue;
      const kind = titles[c] === 'expenses' ? 'expense' : 'income';
      const nextTitle = titles.findIndex((cell, index) => index > c && (cell === 'expenses' || cell === 'income'));
      for (let r = t + 1; r < Math.min(grid.length, t + 7); r += 1) {
        const plannedCol = (grid[r] ?? []).findIndex((cell, index) => index >= c && (nextTitle < 0 || index < nextTitle) && normalizeText(String(cell)) === 'planned');
        if (plannedCol < 0) continue;
        let endRow = grid.length;
        for (let below = r + 1; below < grid.length; below += 1) {
          const title = normalizeText(String(grid[below]?.[c] ?? ''));
          if (title === 'expenses' || title === 'income') { endRow = below; break; }
        }
        sections.push({ kind, headerRow: r, labelCol: c, plannedCol, endRow });
        break;
      }
    }
  }
  return sections;
}

function summaryCategories(grid: SummaryGrid, kind: 'expense' | 'income', layout?: SummaryLayout): string[] {
  const result: string[] = [];
  for (const section of discoverSummarySections(grid, layout).filter((entry) => entry.kind === kind)) {
    for (let r = section.headerRow + 1; r < section.endRow; r += 1) {
      for (let c = section.labelCol; c < section.plannedCol; c += 1) {
        const value = String(grid[r]?.[c] ?? '').trim();
        if (value && !value.startsWith('=') && !parseMoney(value)) result.push(value);
      }
    }
  }
  return [...new Set(result)];
}

function findTemplatePlannedUpdates(
  grid: SummaryGrid,
  startingBalance: string,
  expensePlan: Record<string, string>,
  incomePlan: Record<string, string>,
  merges: SheetMerge[] = [],
  layout?: SummaryLayout,
): { range: string; values: unknown[][] }[] {
  const updates: { range: string; values: unknown[][] }[] = [];
  const amount = (raw: string, label: string) => {
    const parsed = parseMoney(raw);
    if (!parsed) throw new Error('Invalid amount for ' + label + '. No setup values were written.');
    return parsed.amount;
  };
  if (startingBalance.trim() && layout) {
    updates.push({ range: 'Summary!' + layout.startingBalanceCell, values: [[amount(startingBalance, 'starting balance')]] });
  } else if (startingBalance.trim()) {
    let target: { r: number; c: number } | undefined;
    for (let r = 0; r < grid.length && !target; r += 1) {
      for (let c = 0; c < (grid[r]?.length ?? 0); c += 1) {
        if (normalizeText(String(grid[r][c])) !== 'starting balance') continue;
        const labelMerge = merges.find((merge) => merge.startRowIndex === r && merge.startColumnIndex === c);
        const firstColumn = labelMerge?.endColumnIndex ?? c + 1;
        for (let next = firstColumn; next < firstColumn + 6; next += 1) {
          const cell = String(grid[r]?.[next] ?? '').trim();
          if (cell.startsWith('=')) break;
          if (cell && parseMoney(cell)) { target = { r, c: next }; break; }
          if (cell) break;
        }
        if (!target && labelMerge && !String(grid[r]?.[firstColumn] ?? '').trim()) target = { r, c: firstColumn };
      }
    }
    if (!target) throw new Error('Could not identify the editable starting balance cell in Summary. No setup values were written.');
    updates.push({ range: 'Summary!' + columnName(target.c) + (target.r + 1), values: [[amount(startingBalance, 'starting balance')]] });
  }
  const sections = discoverSummarySections(grid, layout);
  for (const [kind, plans] of [['expense', expensePlan], ['income', incomePlan]] as const) {
    for (const [category, rawAmount] of Object.entries(plans)) {
      if (!rawAmount.trim() || (kind === 'income' && category === 'Savings') || (kind === 'expense' && TRANSFER_CATEGORIES.has(sheetCategory(category)))) continue;
      let range = '';
      for (const section of sections.filter((entry) => entry.kind === kind)) {
        for (let r = section.headerRow + 1; r < section.endRow && !range; r += 1) {
          for (let c = section.labelCol; c < section.plannedCol; c += 1) {
            const label = String(grid[r]?.[c] ?? '');
            const matches = kind === 'expense' ? normalizeText(sheetCategory(label)) === normalizeText(sheetCategory(category)) : normalizeText(label) === normalizeText(category);
            if (matches) { range = 'Summary!' + columnName(section.plannedCol) + (r + 1); break; }
          }
        }
        if (range) break;
      }
      if (!range) throw new Error('Could not find the planned ' + kind + ' category "' + sheetCategory(category) + '" in Summary. No setup values were written.');
      updates.push({ range, values: [[amount(rawAmount, category)]] });
    }
  }
  return updates;
}
function formatMoney(amount: number, currency = 'CAD'): string {
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return '$' + amount.toFixed(2);
  }
}

function formatDate(date: string): string {
  if (!date) return '—';
  const parsed = new Date(date + 'T12:00:00');
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

function CategoryOptions({ filterMode = false }: { filterMode?: boolean }) {
  if (filterMode) return <>
    <option className="category-option-expense" value="group:expense">Expenses</option>
    {CATEGORIES.filter((category) => category !== 'Income').map((category) => <option className="category-option-expense" key={category} value={category}>{'　' + category}</option>)}
    <option className="category-option-income" value="group:income">Income</option>
    {INCOME_CATEGORIES.map((category) => <option className="category-option-income" key={'Income:' + category} value={'Income:' + category}>{'　' + category}</option>)}
    <option className="category-option-bookkeeping" value="group:bookkeeping">Bookkeeping</option>
    {BOOKKEEPING_CATEGORIES.map((category) => <option className="category-option-bookkeeping" key={category} value={category}>{'　' + category}</option>)}
    <option className="category-option-uncategorized">Uncategorized</option>
  </>;
  return <>
    <optgroup label="Expenses" className="category-group-expense">
      {CATEGORIES.filter((category) => category !== 'Income')
        .map((category) => <option className="category-option-expense" key={category}>{category}</option>)}
    </optgroup>
    <optgroup label="Income" className="category-group-income">
      {INCOME_CATEGORIES.map((category) => <option className="category-option-income" key={category} value={'Income:' + category}>{category}</option>)}
    </optgroup>
    <optgroup label="Bookkeeping" className="category-group-bookkeeping">
      {BOOKKEEPING_CATEGORIES.map((category) => <option className="category-option-bookkeeping" key={category}>{category}</option>)}<option className="category-option-uncategorized">Uncategorized</option>
    </optgroup>
  </>;
}

function prepareImports(batches: ImportBatch[], existing: Transaction[], rules: Record<string, string>) {
  const knownKeys = new Set(existing.map((transaction) => transaction.importKey));
  // Keep stored records and their keys intact while matching older account labels.
  for (const transaction of existing) {
    const kind = transaction.accountKind ?? (/card|visa|mastercard|amex|cobalt/i.test(transaction.accountName)
      ? 'card' : inferAccountKind(transaction.institution));
    knownKeys.add(transactionKey({ ...transaction, accountName: transaction.institution + (kind === 'card' ? ' card' : ' account') }));
  }
  const next: Transaction[] = [];
  let duplicateCount = 0;
  for (const batch of batches) {
    const accountName = batch.institution + (batch.accountKind === 'card' ? ' card' : ' account');
    for (const raw of batch.rows) {
      let amount = raw.amount;
      if (batch.format === 'CSV' && batch.accountKind === 'card' && !raw.signNormalized) amount = -amount;
      amount = Math.round(amount * 100) / 100;
      const basis = {
        ...raw,
        amount,
        currency: raw.currency || batch.currency || 'CAD',
        institution: batch.institution,
        accountName,
      };
      const importKey = transactionKey(basis);
      if (knownKeys.has(importKey)) {
        duplicateCount += 1;
        continue;
      }
      knownKeys.add(importKey);
      const suggestion = categorize(raw.description, rules, amount, batch.accountKind);
      next.push({
        ...basis,
        accountKind: batch.accountKind,
        id: importKey,
        importKey,
        institution: batch.institution,
        accountName,
        category: suggestion.category,
        incomeCategory: suggestion.incomeCategory,
        categorySource: suggestion.source,
        fileName: batch.fileName,
        shared: false,
        splitCount: 2,
      });
    }
  }
  return { next, duplicateCount };
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>(() => getStored<Transaction[]>(STORAGE.transactions, [])
    .map(migrateBookkeeping));
  const [rules, setRules] = useState<Record<string, string>>(() => getStored(STORAGE.rules, {}));
  const [pending, setPending] = useState<ImportBatch[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'connections'>('overview');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  });
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc');
  const [isDragging, setIsDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem(STORAGE.sheetUrl) ?? '');
  const [tabName, setTabName] = useState(() => localStorage.getItem(STORAGE.tabName) ?? 'Transactions');
  const [sheetTitle, setSheetTitle] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [sheetTabId, setSheetTabId] = useState<number | null>(null);
  const [ledgerTabName, setLedgerTabName] = useState('Imported Ledger');
  const [templateTransactionTabId, setTemplateTransactionTabId] = useState<number | null>(null);
  const [sharedExpensesTabId, setSharedExpensesTabId] = useState<number | null>(null);
  const [summaryTabName, setSummaryTabName] = useState('');
  const [isMonthlyBudgetTemplate, setIsMonthlyBudgetTemplate] = useState(false);
  const [transactionSections, setTransactionSections] = useState<TransactionSection[]>([]);
  const [startingBalance, setStartingBalance] = useState(() => localStorage.getItem(STORAGE.startingBalance) ?? '');
  const [plannedExpenses, setPlannedExpenses] = useState<Record<string, string>>(() => getStored(STORAGE.expensePlan, {}));
  const [plannedIncome, setPlannedIncome] = useState<Record<string, string>>(() => getStored(STORAGE.incomePlan, {}));
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSheetTabId(null);
    setSheetTitle('');
    setAccessToken('');
    setIsMonthlyBudgetTemplate(false);
    setTransactionSections([]);
    setSyncMessage('');
  }, [clientId, sheetUrl, tabName]);

  useEffect(() => localStorage.setItem(STORAGE.transactions, JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem(STORAGE.rules, JSON.stringify(rules)), [rules]);
  useEffect(() => {

    localStorage.setItem(STORAGE.sheetUrl, sheetUrl);
    localStorage.setItem(STORAGE.tabName, tabName);
  }, [clientId, sheetUrl, tabName]);
  useEffect(() => {
    localStorage.setItem(STORAGE.startingBalance, startingBalance);
    localStorage.setItem(STORAGE.expensePlan, JSON.stringify(plannedExpenses));
    localStorage.setItem(STORAGE.incomePlan, JSON.stringify(plannedIncome));
  }, [startingBalance, plannedExpenses, plannedIncome]);

  const monthTransactions = useMemo(
    () => transactionsForMonth(transactions, month),
    [transactions, month],
  );
  const reviewedTransactions = useMemo(() => reconcileTransfers(transactions, rules), [transactions, rules]);
  const reviewedMonthTransactions = useMemo(() => transactionsForMonth(reviewedTransactions, month), [reviewedTransactions, month]);
  const monthLabel = /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ? new Date(month + '-01T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) : 'selected month';
  const spending = useMemo(() => summarizeSpending(transactions, month, rules), [transactions, month, rules]);
  const uncategorized = reviewedMonthTransactions.filter((transaction) => transaction.category === 'Uncategorized').length;
  const filteredTransactions = useMemo(() => {
    const query = normalizeText(search);
    return [...reviewedMonthTransactions]
      .filter((transaction) => matchesCategoryFilter(transaction, categoryFilter))
      .filter((transaction) => !query || normalizeText(transaction.description + ' ' + transaction.accountName + ' ' + transaction.institution + ' ' + categoryLabel(transaction)).includes(query))
      .sort((a, b) => (dateSort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) || a.description.localeCompare(b.description));
  }, [reviewedMonthTransactions, categoryFilter, search, dateSort]);

  async function handleFiles(files: FileList | File[]) {
    const newBatches: ImportBatch[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const isOfx = /\.(qfx|qbo|ofx)$/i.test(file.name) || /<OFX>|<OFXHEADER|<STMTTRN>/i.test(text.slice(0, 800));
        const source = detectImportSource(text, file.name, isOfx);
        let parsed: { rows: RawTransaction[]; skipped: number };
        let currency = 'CAD';

        if (isOfx) {
          const result = parseOfx(text);
          parsed = result;
          currency = result.currency || currency;

        } else {
          parsed = parseCsvText(text);
        }
        if (!parsed.rows.length) {
          problems.push(file.name + ': no transaction rows were recognized');
          continue;
        }
        newBatches.push({
          ...source,
          id: hashString(file.name + file.size + Date.now() + Math.random()),
          fileName: file.name,
          currency,
          rows: parsed.rows,
          skipped: parsed.skipped,
          format: isOfx ? 'QFX / OFX' : 'CSV',
        });
      } catch {
        problems.push(file.name + ': could not read this file');
      }
    }
    setPending((current) => [...current, ...newBatches]);
    if (newBatches.length) setNotice(newBatches.length + ' file' + (newBatches.length === 1 ? '' : 's') + ' ready to review.');
    if (problems.length) setNotice(problems.join(' · '));
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) void handleFiles(event.target.files);
    event.target.value = '';
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length) void handleFiles(event.dataTransfer.files);
  }

  function updateBatch(id: string, change: Partial<ImportBatch>) {
    setPending((current) => current.map((batch) => batch.id === id ? { ...batch, ...change } : batch));
  }

  function importBatches(batches: ImportBatch[]) {
    const { next, duplicateCount } = prepareImports(batches, transactions, rules);
    const importedIds = new Set(batches.map((batch) => batch.id));
    setTransactions((current) => [...current, ...next].sort((a, b) => a.date.localeCompare(b.date)));
    setPending((current) => current.filter((item) => !importedIds.has(item.id)));
    setNotice(next.length + ' transactions added; ' + duplicateCount + ' duplicates skipped.');
  }
  function removeBatch(id: string) {
    setPending((current) => current.filter((batch) => batch.id !== id));
  }

  function updateCategory(transaction: Transaction, value: string) {
    const selection = parseCategorySelection(value);
    const { category } = selection;
    setTransactions((current) => current.map((item) => item.id === transaction.id
      ? {
        ...item,
        ...selection,
        categorySource: 'Manual',
        shared: category === 'Income' || TRANSFER_CATEGORIES.has(category) ? false : item.shared,
      }
      : item));
    if (isGenericDescription(transaction.description)) return;
    setRules((current) => ({
      ...current, [normalizeText(transaction.description)]: value,
      ...(merchantKey(transaction.description).length >= 4 ? { ['merchant:' + merchantKey(transaction.description)]: value } : {}),
    }));
  }

  function updateShared(transaction: Transaction, shared: boolean) {
    if (shared && (transaction.amount >= 0 || transaction.category === 'Income' || TRANSFER_CATEGORIES.has(transaction.category))) {
      setNotice('Mark a spending transaction as shared. Income, transfers, and card payments are excluded from split tracking.');
      return;
    }
    setTransactions((current) => current.map((item) => item.id === transaction.id
      ? { ...item, shared, splitCount: item.splitCount || 2 }
      : item));
  }

  function updateSplitCount(transaction: Transaction, splitCount: number) {
    setTransactions((current) => current.map((item) => item.id === transaction.id
      ? { ...item, splitCount: Math.max(2, Math.min(20, Math.trunc(splitCount) || 2)) }
      : item));
  }

  function downloadCsv() {
    const rows = [
      HEADERS,
      ...[...transactions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => [
          item.date, item.postedDate, item.description, item.amount.toFixed(2),
          item.currency, item.accountName, item.institution, categoryLabel(item),
          item.categorySource, item.shared ? 'Yes' : 'No', item.shared ? item.splitCount : '',
          item.shared ? (Math.abs(item.amount) / item.splitCount).toFixed(2) : '',
          item.shared ? (Math.abs(item.amount) * (item.splitCount - 1) / item.splitCount).toFixed(2) : '',
          item.importKey,
        ]),
    ];
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'budget-transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadGoogleScript() {
    if (window.google?.accounts?.oauth2) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      if (existing?.dataset.loaded === 'true') {
        resolve();
        return;
      }
      const script = existing ?? document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error('Google sign-in could not be loaded.'));
      if (!existing) document.head.appendChild(script);
    });
  }

  async function authorizeGoogle(prompt = ''): Promise<string> {
    if (!clientId.trim()) throw new Error('Google Sheets connection is not configured for this installation. See the README setup instructions.');
    await loadGoogleScript();
    return new Promise((resolve, reject) => {
      const google = window.google;
      if (!google?.accounts?.oauth2) {
        reject(new Error('Google sign-in did not finish loading. Try again.'));
        return;
      }
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId.trim(),
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: (response) => {
          if (response.error === 'invalid_client') {
            reject(new Error('Google rejected this OAuth client. Add this exact origin to its Authorized JavaScript origins: ' + window.location.origin));
            return;
          }
          if (response.error || !response.access_token) {
            reject(new Error('Google authorization was not completed' + (response.error ? ' (' + response.error + ').' : '.')));
            return;
          }
          setAccessToken(response.access_token);
          resolve(response.access_token);
        },
      });
      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function sheetsRequest(path: string, token: string, init: RequestInit = {}) {
    const response = await fetch('https://sheets.googleapis.com/v4/' + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = body?.error?.message ?? 'Google Sheets request failed (' + response.status + ').';
      throw new Error(message);
    }
    return response.status === 204 ? null : response.json();
  }

  async function connectSheet() {
    setIsConnecting(true);
    setSyncMessage('');
    try {
      const id = extractSheetId(sheetUrl);
      if (!id || id.includes(' ') || id.length < 10) throw new Error('Paste a Google Sheets URL or spreadsheet ID.');
      const token = await authorizeGoogle('consent');
      const metadata = await sheetsRequest(
        'spreadsheets/' + encodeURIComponent(id) + '?fields=spreadsheetId,properties.title,sheets.properties',
        token,
      ) as { properties?: { title?: string }; sheets?: { properties: { sheetId: number; title: string } }[] };
      const initialSheets = metadata.sheets ?? [];
      const summary = initialSheets.find((sheet) => sheet.properties.title === 'Summary');
      const templateTransactions = initialSheets.find((sheet) => sheet.properties.title === 'Transactions');
      const isTemplate = Boolean(summary && templateTransactions);
      const transactionGrid = isTemplate
        ? await sheetsRequest(
          'spreadsheets/' + encodeURIComponent(id) + '/values/Transactions!A1:Z1000',
          token,
        ) as { values?: string[][] }
        : { values: [] as string[][] };
      const sections = isTemplate ? discoverTransactionSections(transactionGrid.values ?? []) : [];
      if (isTemplate && sections.length < 2) {
        throw new Error('I found the budget template, but could not identify both its Expenses and Income tables. No sheet rows were changed.');
      }
      const hasExampleRows = isTemplate && sections.some((section) =>
        (transactionGrid.values ?? []).some((row) => {
          const date = parseDate(row[section.columns.date]);
          const description = normalizeText(String(row[section.columns.description] ?? ''));
          return date.startsWith('2000-') && (description === 'rent' || description === 'paycheck');
        }),
      );

      const sheetRequests: { addSheet: { properties: { title: string } } }[] = [];
      const wantedLedger = isTemplate ? 'Imported Ledger' : tabName;
      if (!initialSheets.some((sheet) => sheet.properties.title === wantedLedger)) {
        sheetRequests.push({ addSheet: { properties: { title: wantedLedger } } });
      }
      if (isTemplate && !initialSheets.some((sheet) => sheet.properties.title === 'Shared Expenses')) {
        sheetRequests.push({ addSheet: { properties: { title: 'Shared Expenses' } } });
      }
      if (sheetRequests.length) {
        await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + ':batchUpdate', token, {
          method: 'POST',
          body: JSON.stringify({ requests: sheetRequests }),
        });
      }
      const refreshed = await sheetsRequest(
        'spreadsheets/' + encodeURIComponent(id) + '?fields=properties.title,sheets.properties',
        token,
      ) as { properties?: { title?: string }; sheets?: { properties: { sheetId: number; title: string } }[] };
      const sheets = refreshed.sheets ?? initialSheets;
      const ledgerTab = sheets.find((sheet) => sheet.properties.title === wantedLedger);
      const sharedTab = sheets.find((sheet) => sheet.properties.title === 'Shared Expenses');
      const transactionTab = sheets.find((sheet) => sheet.properties.title === 'Transactions');
      if (!ledgerTab) throw new Error('Could not create the ' + wantedLedger + ' tab.');

      const ledgerHeader = await sheetsRequest(
        'spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(wantedLedger + '!A1:N1'),
        token,
      ) as { values?: string[][] };
      if (!ledgerHeader.values?.length) {
        await sheetsRequest(
          'spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(wantedLedger + '!A1:N1') + '?valueInputOption=RAW',
          token,
          { method: 'PUT', body: JSON.stringify({ values: [HEADERS] }) },
        );
      }
      if (isTemplate) {
        const sharedHeader = await sheetsRequest(
          'spreadsheets/' + encodeURIComponent(id) + '/values/Shared%20Expenses!A1:J1',
          token,
        ) as { values?: string[][] };
        if (!sharedHeader.values?.length) {
          await sheetsRequest(
            'spreadsheets/' + encodeURIComponent(id) + '/values/Shared%20Expenses!A1:J1?valueInputOption=RAW',
            token,
            { method: 'PUT', body: JSON.stringify({ values: [SHARED_EXPENSE_HEADERS] }) },
          );
        }
      }
      setLedgerTabName(wantedLedger);
      setSheetTabId(ledgerTab.properties.sheetId);
      setTemplateTransactionTabId(isTemplate ? transactionTab?.properties.sheetId ?? null : null);
      setSharedExpensesTabId(isTemplate ? sharedTab?.properties.sheetId ?? null : null);
      setSummaryTabName(isTemplate ? 'Summary' : '');
      setIsMonthlyBudgetTemplate(isTemplate);
      setTransactionSections(isTemplate ? sections : []);
      setSheetTitle(metadata.properties?.title ?? 'Google Sheet');
      setSyncMessage(isTemplate
        ? 'Connected to your Monthly Budget copy. Imports will update Transactions, Shared Expenses, and the combined Imported Ledger tab.' +
          (hasExampleRows ? ' Template sample Rent/Paycheck rows dated 2000 are still present; remove those from Transactions so they do not affect actual totals.' : '')
        : 'Connected to ' + (metadata.properties?.title ?? 'your sheet') + ' · tab: ' + wantedLedger);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not connect to Google Sheets.');
    } finally {
      setIsConnecting(false);
    }
  }

  async function syncToSheet() {
    setIsSyncing(true);
    setSyncMessage('');
    try {
      if (sheetTabId === null) throw new Error('Connect the selected Google Sheet before uploading.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a calendar month before uploading.');
      const token = accessToken || await authorizeGoogle();
      const spreadsheetId = extractSheetId(sheetUrl);
      if (!spreadsheetId) throw new Error('Connect a Google Sheet first.');
      const idRange = encodeURIComponent(ledgerTabName + '!N2:N');
      const existing = await sheetsRequest(
        'spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + idRange,
        token,
      ) as { values?: string[][] };
      const known = new Set((existing.values ?? []).flat().filter(Boolean));
      const additions = [...reviewedMonthTransactions]
        .filter((item) => !known.has(item.importKey))
        .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
      let budgetRowsAdded = 0;
      let sharedRowsAdded = 0;
      let categoryRowsFixed = 0;
      let setupCellsUpdated = 0;
      let budgetUpdates: { range: string; values: unknown[][] }[] = [];

      if (isMonthlyBudgetTemplate) {
        const summaryGrid = await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Summary!A:AZ?valueRenderOption=FORMULA', token) as { values?: SummaryGrid };
        const summaryValues = summaryGrid.values ?? [];
        // Resolve all nonblank setup fields before making any upload writes.
        const setupUpdates = findTemplatePlannedUpdates(summaryValues, startingBalance, plannedExpenses, plannedIncome, [], SUMMARY_LAYOUT);
        const incomeCategories = summaryCategories(summaryValues, 'income', SUMMARY_LAYOUT);
        const expenseCategories = summaryCategories(summaryValues, 'expense', SUMMARY_LAYOUT);
        const foodCategory = templateCategory('Food / Groceries', '', incomeCategories, undefined, expenseCategories);
        const transactionGrid = await sheetsRequest(
          'spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Transactions!A:Z',
          token,
        ) as { values?: string[][] };
        const sections = transactionSections.length ? transactionSections : discoverTransactionSections(transactionGrid.values ?? []);
        const categoryRepairs = findFoodCategoryRepairs(transactionGrid.values ?? [], sections, month, foodCategory);
        budgetUpdates.push(...categoryRepairs);
        categoryRowsFixed = categoryRepairs.length;
        const existingBudgetKeys = new Set<string>();
        const nextRowByKind: Record<'expense' | 'income', number> = { expense: 0, income: 0 };
        for (const section of sections) {
          const rows = transactionGrid.values ?? [];
          let lastDataRow = section.headerRow;
          for (let r = section.headerRow + 1; r < rows.length; r += 1) {
            const row = rows[r] ?? [];
            const dateValue = row[section.columns.date];
            const description = String(row[section.columns.description] ?? '').trim();
            const amountValue = Number(String(row[section.columns.amount] ?? '').replace(/[,$]/g, ''));
            const category = String(row[section.columns.category] ?? '').trim();
            if (dateValue || description || amountValue) {
              lastDataRow = r;
              const date = parseDate(dateValue);
              if (date && description && Number.isFinite(amountValue) && category) {
                existingBudgetKeys.add(budgetRowKey(section.kind, date, amountValue, description));
              }
            }
          }
          nextRowByKind[section.kind] = Math.max(nextRowByKind[section.kind], lastDataRow + 2);
        }

        const byKind: Record<'expense' | 'income', Transaction[]> = { expense: [], income: [] };
        for (const item of reviewedMonthTransactions) {
          // The ledger is written last: known rows completed an earlier upload.
          // Local category changes must not append the same charge a second time.
          if (known.has(item.importKey)) continue;
          if (TRANSFER_CATEGORIES.has(item.category)) continue;
          byKind[item.category === 'Income' ? 'income' : 'expense'].push(item);
        }
        const pendingWrites: { section: TransactionSection; entries: { item: Transaction; amount: number; category: string }[] }[] = [];
        for (const section of sections) {
          const entries = byKind[section.kind]
            .map((item) => ({
              item,
              amount: section.kind === 'income'
                ? (item.amount < 0 ? -Math.abs(item.amount) : Math.abs(item.amount))
                : (item.amount < 0 ? Math.abs(item.amount) : -Math.abs(item.amount)),
              category: templateCategory(item.category, item.description, incomeCategories, item.incomeCategory, expenseCategories),
            }))
            .filter((entry) => {
              const key = budgetRowKey(section.kind, entry.item.date, entry.amount, entry.item.description);
              if (existingBudgetKeys.has(key)) return false;
              existingBudgetKeys.add(key);
              return true;
            })
            .sort((a, b) => a.item.date.localeCompare(b.item.date));
          if (entries.length) pendingWrites.push({ section, entries });
        }
        const colName = (index: number) => {
          let n = index + 1;
          let name = '';
          while (n > 0) {
            const remainder = (n - 1) % 26;
            name = String.fromCharCode(65 + remainder) + name;
            n = Math.floor((n - 1) / 26);
          }
          return name;
        };
        for (const group of pendingWrites) {
          const section = group.section;
          const startRow = nextRowByKind[section.kind];
          const width = section.right - section.left + 1;
          const datePos = section.columns.date - section.left;
          const amountPos = section.columns.amount - section.left;
          const descriptionPos = section.columns.description - section.left;
          const categoryPos = section.columns.category - section.left;
          const values = group.entries.map((entry) => {
            const row: unknown[] = Array(width).fill('');
            row[datePos] = entry.item.date;
            row[amountPos] = entry.amount;
            row[descriptionPos] = entry.item.description;
            row[categoryPos] = entry.category;
            return row;
          });
          const endRow = startRow + values.length - 1;
          budgetUpdates.push({
            range: 'Transactions!' + colName(section.left) + startRow + ':' + colName(section.right) + endRow,
            values,
          });
          budgetRowsAdded += values.length;
        }

        if (budgetUpdates.length) {
          await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values:batchUpdate', token, {
            method: 'POST',
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: budgetUpdates }),
          });
          if (templateTransactionTabId !== null) {
            await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', token, {
              method: 'POST',
              body: JSON.stringify({
                requests: sections.map((section) => ({
                  sortRange: {
                    range: {
                      sheetId: templateTransactionTabId,
                      startRowIndex: section.headerRow + 1,
                      endRowIndex: (transactionGrid.values?.length ?? 0) + budgetRowsAdded,
                      startColumnIndex: section.left,
                      endColumnIndex: section.right + 1,
                    },
                    sortSpecs: [{ dimensionIndex: section.columns.date, sortOrder: 'ASCENDING' }],
                  },
                })),
              }),
            });
          }
        }

        const sharedKeyRange = await sheetsRequest(
          'spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Shared%20Expenses!J2:J',
          token,
        ) as { values?: string[][] };
        const sharedKeys = new Set((sharedKeyRange.values ?? []).flat().filter(Boolean));
        const sharedAdds = reviewedMonthTransactions.filter((item) =>
          item.shared && item.amount < 0 && item.category !== 'Income' && !TRANSFER_CATEGORIES.has(item.category) && !sharedKeys.has(item.importKey),
        );
        if (sharedAdds.length) {
          const path = 'spreadsheets/' + encodeURIComponent(spreadsheetId) +
            '/values/' + encodeURIComponent('Shared Expenses!A:J') +
            ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
          await sheetsRequest(path, token, {
            method: 'POST',
            body: JSON.stringify({
              majorDimension: 'ROWS',
              values: sharedAdds.map((item) => {
                const fullAmount = Math.abs(item.amount);
                const people = Math.max(2, item.splitCount || 2);
                const perPerson = Math.round((fullAmount / people) * 100) / 100;
                return [
                  item.date, item.description, templateCategory(item.category, item.description, incomeCategories, item.incomeCategory, expenseCategories),
                  fullAmount, people, perPerson,
                  Math.round((fullAmount - perPerson) * 100) / 100,
                  item.accountName, item.institution, item.importKey,
                ];
              }),
            }),
          });
          sharedRowsAdded = sharedAdds.length;
          if (sharedExpensesTabId !== null) {
            await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', token, {
              method: 'POST',
              body: JSON.stringify({
                requests: [{
                  sortRange: {
                    range: {
                      sheetId: sharedExpensesTabId,
                      startRowIndex: 1,
                      endRowIndex: (sharedKeyRange.values?.length ?? 0) + sharedAdds.length + 1,
                      startColumnIndex: 0,
                      endColumnIndex: SHARED_EXPENSE_HEADERS.length,
                    },
                    sortSpecs: [{ dimensionIndex: 0, sortOrder: 'ASCENDING' }],
                  },
                }],
              }),
            });
          }
        }

        if (summaryTabName) {
          if (setupUpdates.length) {
            await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values:batchUpdate', token, {
              method: 'POST',
              body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: setupUpdates }),
            });
            setupCellsUpdated = setupUpdates.length;
          }
        }
      }

      if (additions.length) {
        const appendPath = 'spreadsheets/' + encodeURIComponent(spreadsheetId) +
          '/values/' + encodeURIComponent(ledgerTabName + '!A:N') +
          ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
        await sheetsRequest(appendPath, token, {
          method: 'POST',
          body: JSON.stringify({
            majorDimension: 'ROWS',
            values: additions.map((item) => {
              const count = item.shared ? Math.max(2, item.splitCount || 2) : '';
              const fullAmount = Math.abs(item.amount);
              const each = item.shared ? Math.round((fullAmount / Number(count)) * 100) / 100 : '';
              const owed = item.shared ? Math.round((fullAmount - Number(each)) * 100) / 100 : '';
              return [
                item.date, item.postedDate, item.description, item.amount,
                item.currency, item.accountName, item.institution, categoryLabel(item),
                item.categorySource, item.shared ? 'Yes' : 'No', count, each, owed, item.importKey,
              ];
            }),
          }),
        });
        if (sheetTabId !== null) {
          const endRow = (existing.values?.length ?? 0) + additions.length + 1;
          await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate', token, {
            method: 'POST',
            body: JSON.stringify({
              requests: [{
                sortRange: {
                  range: { sheetId: sheetTabId, startRowIndex: 1, endRowIndex: endRow, startColumnIndex: 0, endColumnIndex: HEADERS.length },
                  sortSpecs: [{ dimensionIndex: 0, sortOrder: 'ASCENDING' }],
                },
              }],
            }),
          });
        }
      }
      if (!additions.length && budgetRowsAdded === 0 && sharedRowsAdded === 0 && categoryRowsFixed === 0 && setupCellsUpdated === 0) {
        setSyncMessage('Everything is already in the sheet.');
        return;
      }
      setSheetTitle((value) => value || 'Google Sheet');
      const parts = [];
      if (additions.length) parts.push(additions.length + ' row' + (additions.length === 1 ? '' : 's') + ' added to Imported Ledger');
      if (budgetRowsAdded) parts.push(budgetRowsAdded + ' budget transaction' + (budgetRowsAdded === 1 ? '' : 's') + ' added');
      if (sharedRowsAdded) parts.push(sharedRowsAdded + ' shared expense' + (sharedRowsAdded === 1 ? '' : 's') + ' added');
      if (categoryRowsFixed) parts.push(categoryRowsFixed + ' Food categories corrected');
      if (setupCellsUpdated) parts.push(setupCellsUpdated + ' budget setup cells updated');
      setSyncMessage(monthLabel + ': ' + (parts.join(' · ') || 'Everything is already in the sheet.'));
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Upload failed. Reconnect and try again.');
    } finally {
      setIsSyncing(false);
    }
  }

  function clearAll() {
    if (!window.confirm('Clear imported transactions and learned category rules for ALL months from this browser? Export a ledger CSV first if you need a backup. Your Google Sheet, connection settings, and budget setup values will stay unchanged.')) return;
    setTransactions([]);
    setRules({});
    setNotice('Local transaction data cleared.');
    setSyncMessage('');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><span></span><span></span><span></span></div>
          <div>
            <div className="brand-name">budget bridge</div>
            <div className="brand-caption">BANK EXPORTS → BUDGET</div>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('overview')}>
            <Icon>◫</Icon><span>Overview</span><span className="nav-dot"></span>
          </button>
          <button className={activeTab === 'transactions' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('transactions')}>
            <Icon>▤</Icon><span>Transactions</span><span className="nav-count">{transactions.length || ''}</span>
          </button>
          <button className={activeTab === 'connections' ? 'nav-item active' : 'nav-item'} onClick={() => setActiveTab('connections')}>
            <Icon>⛓</Icon><span>Connections</span>
          </button>
        </nav>
        <div className="sidebar-spacer"></div>
        <div className="privacy-card">
          <div className="privacy-icon">⌁</div>
          <div className="privacy-title">Your files stay local</div>
          <p>Imports are read in this browser. Nothing is sent anywhere until you choose to sync.</p>
          <div className="privacy-status"><span></span> LOCAL-FIRST MODE</div>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">JL</div>
          <div className="profile-copy"><strong>My budget</strong><span>Personal workspace</span></div>
          <button className="clear-data-button" aria-label="Clear local ledger and learned rules for all months" title="Clear local ledger & rules" onClick={clearAll}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
            </svg>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{activeTab === 'overview' ? 'Overview' : activeTab === 'transactions' ? 'Transactions' : 'Connections'}</strong></div>
          <div className="top-actions">
            <span className="local-chip"><span></span> LOCAL DATA</span>
          </div>
        </header>

        <div className="page-wrap">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-line"></span> YOUR MONEY, IN ONE PLACE</div>
              <h1>{activeTab === 'overview' ? 'Bring your budget together.' : activeTab === 'transactions' ? 'Every transaction, in order.' : 'Connect your budget sheet.'}</h1>
              <p className="subtitle">{activeTab === 'overview' ? 'Import bank exports, review categories, and sync to your Monthly Budget sheet.' : activeTab === 'transactions' ? 'Review, categorize, and split transactions imported on this device.' : 'Set up Google Sheets access and manage where your reviewed transactions are uploaded.'}</p>
            </div>
            <div className="month-control">
              <label htmlFor="month-picker">VIEWING PERIOD</label>
              <input id="month-picker" type="month" value={month} disabled={isSyncing || isConnecting} onChange={(event) => setMonth(event.target.value)} />
            </div>
          </section>

          <section className={activeTab === 'overview' ? 'step-strip' : 'step-strip view-hidden'}>
            <div className="step active"><span className="step-number">01</span><div><strong>Import</strong><small>CSV, QFX, QBO or OFX</small></div></div>
            <div className="step-connector"></div>
            <div className={transactions.length ? 'step active' : 'step'}><span className="step-number">02</span><div><strong>Review</strong><small>Categories & duplicates</small></div></div>
            <div className="step-connector"></div>
            <div className={sheetTitle ? 'step active' : 'step'}><span className="step-number">03</span><div><strong>Sync</strong><small>Your Google Sheet</small></div></div>
            <div className="step-note"><span className="tiny-lock">◇</span> No bank passwords required</div>
          </section>

          <section className={activeTab === 'overview' ? 'stats-grid' : 'stats-grid view-hidden'}>
            <div className="stat-card stat-financial">
              <div className="stat-top"><span>INCOME · EXCLUDES REFUNDS</span><span className="stat-icon">↗</span></div>
              <div className="stat-number spending-totals">{spending.length
                ? spending.map((group) => <span key={group.currency}>{group.currency} {formatMoney(group.income, group.currency)}</span>)
                : formatMoney(0)}</div>
              <div className="stat-foot"><span className="stat-marker green"></span> {spending.some((group) => group.unknownCredits > 0) ? 'Excludes refunds/transfers; uncategorized deposits need review' : 'Refunds reduce net spending instead; transfers excluded'}</div>
            </div>
            <div className="stat-card stat-spend">
              <div className="stat-top"><span>NET SPENDING · SELECTED MONTH</span><span className="stat-icon">↘</span></div>
              <div className="stat-number spending-totals">{spending.length
                ? spending.map((group) => <span key={group.currency}>{group.currency} {formatMoney(group.net, group.currency)}</span>)
                : formatMoney(0)}</div>
              <div className="stat-foot"><span className="stat-marker green"></span> {spending.some((group) => group.pending > 0) ? 'Provisional: uncategorized charges included' : 'Expenses less refunds; currencies kept separate'}</div>
            </div>
            <div className="stat-card stat-financial">
              <div className="stat-top"><span>REMAINING THIS MONTH</span><span className="stat-icon">=</span></div>
              <div className="stat-number spending-totals">{spending.length
                ? spending.map((group) => <span className={group.remaining < 0 ? 'remaining-negative' : ''} key={group.currency}>{group.currency} {formatMoney(group.remaining, group.currency)}</span>)
                : formatMoney(0)}</div>
              <div className="stat-foot"><span className={uncategorized ? 'stat-marker amber' : 'stat-marker green'}></span> {uncategorized ? 'Provisional: review uncategorized transactions' : 'Income minus net spending; not your bank balance'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>TRANSACTIONS IN LEDGER</span><span className="stat-icon">▤</span></div>
              <div className="stat-number">{transactions.length.toLocaleString('en-CA')}</div>
              <div className="stat-foot"><span className="stat-marker blue"></span> {monthTransactions.length} in {monthLabel}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>NEEDS A CATEGORY</span><span className="stat-icon">⌑</span></div>
              <div className="stat-number">{uncategorized}</div>
              <div className="stat-foot"><span className={uncategorized ? 'stat-marker amber' : 'stat-marker green'}></span> {uncategorized ? 'Review before syncing' : 'You’re all caught up'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-top"><span>SHEET CONNECTION</span><span className="stat-icon">↗</span></div>
              <div className="stat-number stat-sheet">{sheetTitle || 'Not connected'}</div>
              <div className="stat-foot"><span className={sheetTitle ? 'stat-marker green' : 'stat-marker muted'}></span> {sheetTitle ? 'Ready to receive updates' : 'Connect when you’re ready'}</div>
            </div>
          </section>

          {activeTab === 'overview' && spending.length > 0 && <details className="panel spending-breakdown">
            <summary>What makes up this spending total?</summary>
            <p>For the selected month: expenses minus categorized refunds. Income, transfers, card payments, and investments are excluded using current local rules; manual choices take priority. Uncategorized outflows are included until reviewed. Shared charges count in full.</p>
            <p>Purchases on your card count as spending; paying its bill does not count again. Savings transfers, investment transfers, and card payments are bookkeeping entries kept in Imported Ledger, outside the budget’s income and expense tables. Interest earned is income.</p>
            <div className="spending-breakdown-grid">{spending.map((group) => <div key={group.currency}>
              <h3>{group.currency}</h3>
              <dl>
                <div><dt>Income</dt><dd>{formatMoney(group.income, group.currency)}</dd></div>
                <div><dt>Expense charges</dt><dd>{formatMoney(group.charges, group.currency)}</dd></div>
                <div><dt>Refunds / expense credits</dt><dd>−{formatMoney(group.refunds, group.currency)}</dd></div>
                <div className="spending-net"><dt>Net spending</dt><dd>{formatMoney(group.net, group.currency)}</dd></div>
                <div className="spending-net"><dt>Remaining (income − net spending)</dt><dd>{formatMoney(group.remaining, group.currency)}</dd></div>
                {group.categories.map((entry) => <div key={entry.category}><dt>{entry.category}</dt><dd>{formatMoney(entry.amount, group.currency)}</dd></div>)}
                <div><dt>Uncategorized charges included</dt><dd>{formatMoney(group.pending, group.currency)}</dd></div>
                <div><dt>Uncategorized deposits excluded</dt><dd>{formatMoney(group.unknownCredits, group.currency)}</dd></div>
              </dl>
              <p>{group.excluded} income / transfer / investment rows excluded.</p>
              <h3>Largest charges counted</h3>
              <dl>{group.largestCharges.map((charge, index) => <div key={charge.id + ':' + index}>
                <dt><button className="spending-charge-link" title={charge.category} onClick={() => { setActiveTab('transactions'); setCategoryFilter('All categories'); setSearch(charge.description); }}>{charge.description}</button></dt>
                <dd>{formatMoney(charge.amount, group.currency)}</dd>
              </div>)}</dl>
            </div>)}</div>
            <p>Use Refresh suggestions in Transactions to apply the current rules to saved category labels. Older imports with an incorrect account type or sign still need review; this calculation keeps their original amounts.</p>
            <button className="button button-outline" onClick={() => { setActiveTab('transactions'); setCategoryFilter('All categories'); setSearch(''); }}>Review this month’s transactions</button>
          </details>}

          {notice && <div className="notice-banner"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

          {pending.length > 0 && activeTab === 'overview' && (
            <section className="panel pending-panel">
              <div className="panel-heading">
                <div><div className="section-kicker">READY TO IMPORT</div><h2>Review your files</h2></div>
              </div>
              <p className="helper-copy">Confirm the source and account type. Imports keep every recognized date and skip duplicates, so overlapping weekly exports are safe. Review and upload use only the calendar month selected above.</p>
              <div className="pending-list">
                {pending.map((batch) => (
                  <div className="pending-file" key={batch.id}>
                    <div className="file-badge">{batch.format === 'CSV' ? 'CSV' : 'OFX'}</div>
                    <div className="file-details">
                      <strong>{batch.fileName}</strong>
                      <span>{batch.rows.length.toLocaleString('en-CA')} rows recognized · {batch.skipped} skipped</span>
                      <small className="field-hint">{batch.detectionNote}</small>
                    </div>
                    <label className="compact-field"><span>BANK</span>
                      <select value={batch.institution} onChange={(event) => {
                        const institution = event.target.value as Institution;
                        updateBatch(batch.id, { institution });
                      }}>
                        {BANKS.map((bank) => <option key={bank}>{bank}</option>)}
                      </select>
                    </label>
                    <label className="compact-field"><span>ACCOUNT TYPE</span>
                      <select value={batch.accountKind} onChange={(event) => {
                        const accountKind = event.target.value as AccountKind;
                        updateBatch(batch.id, { accountKind });
                      }}>
                        <option value="bank">Bank account</option><option value="card">Credit card</option>
                      </select>
                    </label>
                    <div className="file-row-actions">
                      <button className="text-button" onClick={() => removeBatch(batch.id)}>Remove</button>
                      <button className="button button-green button-small" onClick={() => importBatches([batch])}>Import {batch.rows.length} rows <span>→</span></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pending-actions">
                <button className="button button-green import-all-button" onClick={() => importBatches(pending)}>Import all rows ({pending.reduce((sum, batch) => sum + batch.rows.length, 0)})</button>
              </div>
            </section>
          )}

          <div className={`content-grid ${activeTab === 'transactions' ? 'view-hidden' : ''} ${activeTab === 'connections' ? 'connections-mode' : ''}`}>
            <section className={`panel import-panel ${activeTab === 'connections' ? 'view-hidden' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
              <div className="panel-heading">
                <div><div className="section-kicker">STEP 01 · ADD BANK EXPORTS</div><h2>Bring everything together</h2></div>
                <button className="icon-button" aria-label="Import help" onClick={() => setNotice('Export transaction files from each bank’s website, then select several files together. Your bank login stays with the bank.')}>?</button>
              </div>
              <div className={isDragging ? 'drop-zone drag-active' : 'drop-zone'}>
                <input ref={fileInput} type="file" multiple accept=".csv,.qfx,.qbo,.ofx,text/csv,application/x-ofx" onChange={onFileInput} />
                <div className="upload-illustration"><div className="upload-cloud">↑</div><span className="orbit orbit-one"></span><span className="orbit orbit-two"></span></div>
                <h3>Drop bank files here</h3>
                <p>or choose multiple exports from your computer</p>
                <button className="button button-outline" onClick={() => fileInput.current?.click()}>Choose files <span>↗</span></button>
                <div className="format-list"><span>CSV</span><i></i><span>QFX</span><i></i><span>QBO</span><i></i><span>OFX</span></div>
              </div>
              <div className="bank-hints">
                <div className="bank-hints-head"><span>GET YOUR EXPORTS</span><span>OPEN BANK SITE ↗</span></div>
                <div className="bank-links">
                  <a href="https://easyweb.td.com/" target="_blank" rel="noreferrer"><span className="bank-monogram td">TD</span>TD EasyWeb <b>↗</b></a>
                  <a href="https://www.scotiabank.com/ca/en/personal.html" target="_blank" rel="noreferrer"><span className="bank-monogram scotia">S</span>Scotiabank <b>↗</b></a>
                  <a href="https://www.tangerine.ca/app/index.html" target="_blank" rel="noreferrer"><span className="bank-monogram tan">T</span>Tangerine <b>↗</b></a>
                  <a href="https://www.americanexpress.com/en-ca/account/login" target="_blank" rel="noreferrer"><span className="bank-monogram amex">A</span>Amex Online <b>↗</b></a>
                </div>
                <p className="bank-hint-note">Sign in at your bank, download activity, then return here. This app never asks for bank credentials.</p>
              </div>
            </section>

            <section className={`panel connection-panel ${activeTab === 'transactions' ? 'view-hidden' : ''}`} id="connections">
              <div className="panel-heading">
                <div><div className="section-kicker">STEP 03 · YOUR DESTINATION</div><h2>Connect Google Sheets</h2></div>
                <div className={sheetTitle ? 'connection-indicator connected' : 'connection-indicator'}><span></span>{sheetTitle ? 'CONNECTED' : 'OPTIONAL'}</div>
              </div>
              <p className="helper-copy">This connects to your Monthly Budget copy. The full charge updates the budget; shared charges also appear in the split tracker.</p>
              <label className="form-field">
                <span>GOOGLE SHEET LINK OR ID</span>
                <input value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="Paste the link to your budget sheet" />
              </label>
              <div className="form-row">
                {!isMonthlyBudgetTemplate && <label className="form-field">
                  <span>LEDGER TAB FOR A CUSTOM SHEET</span>
                  <input value={tabName} onChange={(event) => setTabName(event.target.value)} />
                </label>}
                <button className="button button-outline connect-button" onClick={() => void connectSheet()} disabled={isConnecting}>
                  {isConnecting ? 'Connecting…' : sheetTitle ? 'Reconnect' : 'Connect sheet'} <span>→</span>
                </button>
              </div>
              {syncMessage && <div className={syncMessage.includes('failed') || syncMessage.includes('Could not') || syncMessage.includes('Add your') || syncMessage.includes('origin') || syncMessage.includes('invalid_client') || syncMessage.includes('authorization') || syncMessage.includes('rejected') ? 'sync-message error' : 'sync-message'}>{syncMessage}</div>}
              <div className="connection-divider"></div>
              <div className="template-row">
                <div className="template-icon">▦</div>
                <div><strong>Need a budget sheet?</strong><span>Make a copy of your Monthly Budget template.</span></div>
                <a className="download-template" href={GOOGLE_MONTHLY_BUDGET_TEMPLATE} target="_blank" rel="noreferrer">Make a copy <span>↗</span></a>
              </div>
              <details className="budget-setup">
                <summary><span>Optional · starting balance and monthly plan</span><b>Set values <i>＋</i></b></summary>
                <div className="setup-body">
                  <label className="form-field starting-balance-field">
                    <span>STARTING BALANCE</span>
                    <input type="number" min="0" step="0.01" value={startingBalance} onChange={(event) => setStartingBalance(event.target.value)} placeholder="Leave blank to keep the sheet value" />
                  </label>
                  <div className="plan-input-groups">
                    <div className="plan-input-group">
                      <div className="plan-group-title">Planned expenses <span>CAD</span></div>
                      {DEFAULT_EXPENSE_PLANS.map((category) => (
                        <label className="plan-input-row" key={category}>
                          <span>{sheetCategory(category)}</span>
                          <input aria-label={'Planned ' + sheetCategory(category)} type="number" min="0" step="0.01" value={plannedExpenses[category] ?? ''} placeholder="—" onChange={(event) => setPlannedExpenses((current) => ({ ...current, [category]: event.target.value }))} />
                        </label>
                      ))}
                    </div>
                    <div className="plan-input-group">
                      <div className="plan-group-title">Planned income <span>CAD</span></div>
                      {DEFAULT_INCOME_PLANS.map((category) => (
                        <label className="plan-input-row" key={category}>
                          <span>{category}</span>
                          <input aria-label={'Planned ' + category} type="number" min="0" step="0.01" value={plannedIncome[category] ?? ''} placeholder="—" onChange={(event) => setPlannedIncome((current) => ({ ...current, [category]: event.target.value }))} />
                        </label>
                      ))}
                    </div>
                  </div>
                  <p>Leave a field blank to preserve its current value. The starting balance goes to Summary; planned amounts go into the matching category rows.</p>
                </div>
              </details>
              {isMonthlyBudgetTemplate && <div className="template-destination-note"><span>✓</span> Full transactions → Transactions + Imported Ledger · Shared splits → Shared Expenses</div>}
              <div className="sync-footer">
                <span>Only {monthLabel} will upload ({reviewedMonthTransactions.length} local rows, including bookkeeping). Connect the matching month’s budget copy. Other imported dates stay on this device.</span>
                <button className="button button-green sync-button" disabled={!sheetTitle || isSyncing || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)} onClick={() => void syncToSheet()}>
                  {isSyncing ? 'Syncing…' : 'Upload ' + monthLabel} <span>↑</span>
                </button>
              </div>
            </section>
          </div>

          <section className={`panel ledger-panel ${activeTab === 'transactions' ? '' : 'view-hidden'}`}>
            <div className="panel-heading ledger-heading">
              <div><div className="section-kicker">STEP 02 · REVIEW YOUR LEDGER</div><h2>{monthLabel} transactions <span className="heading-count">{reviewedMonthTransactions.length}</span></h2></div>
              <div className="table-tools">
                <button className={'button uncategorized-toggle' + (categoryFilter === 'Uncategorized' ? ' active' : '')} aria-pressed={categoryFilter === 'Uncategorized'} title="Filter uncategorized transactions in the selected month" onClick={() => {
                  setCategoryFilter(categoryFilter === 'Uncategorized' ? 'All categories' : 'Uncategorized');
                  setSearch('');
                }}>{categoryFilter === 'Uncategorized' ? 'Show all categories' : 'Show only uncategorized'} <span>({reviewedTransactions.filter((item) => item.date.slice(0, 7) === month && item.category === 'Uncategorized').length})</span></button>
                <button className="button button-outline refresh-suggestions" disabled={!reviewedMonthTransactions.length} title="Update suggestions for the selected month; keep manual categories" onClick={() => {
                  setTransactions((current) => {
                    const refreshed = reconcileTransfers(refreshSuggestions(current, rules), rules);
                    return current.map((item, index) => item.date.slice(0, 7) === month ? refreshed[index] : item);
                  });
                  setNotice('Suggestions refreshed for ' + monthLabel + '. Manual categories were kept. Previously uploaded sheet rows stay unchanged.');
                }}>Refresh suggestions</button>
                <div className="search-box"><span>⌕</span><input aria-label="Search transactions" placeholder="Search merchant…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
                <select className={'filter-select category-tone-' + categoryGroup(categoryFilter)} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option>All categories</option><CategoryOptions filterMode />
                </select>
                <button className="icon-button export-button" title="Export combined CSV" onClick={downloadCsv}>↓</button>
              </div>
            </div>
            {transactions.length === 0 ? (
              <div className="empty-ledger">
                <div className="empty-icon">▤</div><strong>Your ledger is ready when you are.</strong>
                <span>Import your first transaction file to see everything sorted here.</span>
                <button className="text-button" onClick={() => fileInput.current?.click()}>Choose a file <span>→</span></button>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="empty-ledger compact-empty"><strong>No transactions match those filters.</strong><span>Try another month or search.</span></div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead><tr><th aria-sort={dateSort === 'asc' ? 'ascending' : 'descending'}><button className="date-sort-button" onClick={() => setDateSort((current) => current === 'asc' ? 'desc' : 'asc')} title={dateSort === 'asc' ? 'Oldest first. Click for newest first.' : 'Newest first. Click for oldest first.'} aria-label={dateSort === 'asc' ? 'Date: oldest first. Sort newest first' : 'Date: newest first. Sort oldest first'}>DATE <span aria-hidden="true">{dateSort === 'asc' ? '↑' : '↓'}</span></button></th><th>DESCRIPTION</th><th>ACCOUNT</th><th>CATEGORY</th><th>AMOUNT</th><th>SHARED</th><th title="How the category was assigned">CATEGORY STATUS</th></tr></thead>
                  <tbody>
                    {filteredTransactions.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="date-cell">{formatDate(transaction.date)}</td>
                        <td><div className="merchant-cell"><span className={'merchant-avatar merchant-' + (Math.abs(transaction.description.charCodeAt(0) || 0) % 5)}>{transaction.description.trim().charAt(0).toUpperCase() || '•'}</span><span><strong>{transaction.description}</strong><small>{transaction.postedDate && transaction.postedDate !== transaction.date ? 'Posted ' + formatDate(transaction.postedDate) : transaction.fileName}</small></span></div></td>
                        <td><div className="account-cell"><span className="bank-mini">{transaction.institution === 'American Express' ? 'A' : transaction.institution.slice(0, 1)}</span>{transaction.accountName}</div></td>
                        <td><select className={'category-select category-tone-' + categoryGroup(transaction.category)} value={categorySelection(transaction)} onChange={(event) => updateCategory(transaction, event.target.value)}>
                          <CategoryOptions />
                        </select></td>
                        <td className={transaction.amount < 0 ? 'amount-cell expense' : 'amount-cell income'}>{transaction.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(transaction.amount), transaction.currency)}<small className="budget-impact">{budgetImpact(transaction, rules)}</small></td>
                        <td className="shared-cell">
                          <label className="share-toggle"><input type="checkbox" disabled={transaction.amount >= 0 || transaction.category === 'Income' || TRANSFER_CATEGORIES.has(transaction.category)} checked={Boolean(transaction.shared)} onChange={(event) => updateShared(transaction, event.target.checked)} /><span>Split</span></label>
                          {transaction.shared && <label className="split-count"><span>People incl. you</span><input type="number" min="2" max="20" value={transaction.splitCount || 2} onChange={(event) => updateSplitCount(transaction, Number(event.target.value))} /></label>}
                        </td>
                        <td><span className="source-tag" title={transaction.categorySource === 'Rule' ? 'Suggested by local merchant and transaction rules' : transaction.categorySource === 'Manual' ? 'Category chosen by you' : 'No matching rule; choose a category'}>{transaction.categorySource === 'Rule' ? 'Suggested' : transaction.categorySource === 'Manual' ? 'Reviewed' : 'Needs review'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="storage-help">
            <summary>Storage &amp; cleanup</summary>
            <p>Your ledger, category corrections, sheet link, and budget setup are saved in this browser’s local storage, not cookies. They normally stay when you close the page and return later on the same browser profile and site address. Google access tokens stay in memory and expire separately.</p>
            <p>Private browsing, clearing site data, or browser storage cleanup can remove local data. Another browser, device, or site address has separate storage. Export the ledger CSV below for a portable backup; Sheets uploads are separate saved copies.</p>
            <p>Clear ledger &amp; rules removes local transactions and learned rules for all months. It keeps your connection settings and budget setup, and does not delete anything in Google Sheets.</p>
          </details>
          <footer className="page-footer">
            <span>Budget Bridge <i>·</i> bank exports to your budget</span>
            <div><button onClick={downloadCsv}>Export ledger CSV</button><button onClick={clearAll}>Clear ledger &amp; rules</button></div>
          </footer>
        </div>
      </main>
    </div>
  );
}
