import Papa from 'papaparse';
import type { AccountKind, ImportBatch, RawTransaction, Transaction } from '../types';
import { inferAccountKind, inferInstitution } from './accounts';
import { categorize } from './categories';
import { normalizeText, parseDate, parseMoney } from './format';
import { transactionKey } from './ledger';

export function inspectCsv(text: string) {
  let fallback: string[][] = [];
  // Uneven metadata rows can confuse automatic delimiter detection.
  for (const delimiter of ['', ',', ';', '\t', '|']) {
    const grid = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimiter }).data;
    if (!delimiter)
      fallback = grid;
    const headerIndex = grid.slice(0, 50).findIndex((row) => {
      const cells = row.map(normalizeText);
      return cells.some((cell) => /^(transaction date|trans date|date|activity date|transactiondate)$/.test(cell)) &&
        cells.some((cell) => /^(description|transaction description|merchant|details|payee|name|memo|transaction)$/.test(cell)) &&
        cells.some((cell) => /^(amount|transaction amount|net amount|value|total|debit|withdrawal|money out|debit amount|charge|credit|deposit|money in|credit amount|payment)$/.test(cell));
    });
    if (headerIndex >= 0)
      return { grid, headerIndex };
  }
  return { grid: fallback, headerIndex: -1 };
}

// TD's accountactivity download omits headers: date, description, debit, credit, balance.
export function isHeaderlessAccountCsv(grid: string[][]): boolean {
  const valid = (row: string[]) => row.length === 5 &&
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(row[0].trim()) && Boolean(parseDate(row[0])) && Boolean(row[1].trim()) &&
    (!row[2].trim() || parseMoney(row[2]) !== null) && (!row[3].trim() || parseMoney(row[3]) !== null) &&
    (parseMoney(row[2]) !== null || parseMoney(row[3]) !== null) && parseMoney(row[4]) !== null;
  return grid.length > 0 && valid(grid[0]) && grid.filter(valid).length >= grid.length * 0.8;
}

export function detectImportSource(text: string, fileName: string, isOfx: boolean) {
  let metadata: string[];
  let headers: string[] = [];
  let tdAccountLayout = false;
  if (isOfx) {
    // Read account/issuer metadata, never merchant names in transaction blocks.
    const prefix = text.split(/<STMTTRN>/i)[0];
    metadata = [...prefix.matchAll(/<(?:ORG|BANKNAME|ACCTTYPE)>([^<\r\n]+)/gi)].map((match) => match[1]);
    if (/<CCACCTFROM>|<CCSTMTRS>/i.test(prefix))
      metadata.push('credit card');
    else if (/<BANKACCTFROM>/i.test(prefix))
      metadata.push('bank account');
  }
  else {
    const { grid, headerIndex } = inspectCsv(text);
    tdAccountLayout = headerIndex < 0 && isHeaderlessAccountCsv(grid) && /^accountactivity(?:[\s(\d)]*)\.csv$/i.test(fileName);
    headers = headerIndex >= 0 ? grid[headerIndex] ?? [] : [];
    metadata = headerIndex >= 0 ? grid.slice(0, headerIndex).flat() : [];
    const metadataColumns = headers.map((header, index) => /^(bank|bank name|institution|financial institution|account type|account name|card type|product|product name)$/.test(normalizeText(header)) ? index : -1).filter((index) => index >= 0);
    for (const row of grid.slice(headerIndex + 1)) {
      for (const column of metadataColumns)
        if (row[column])
          metadata.push(row[column]);
    }
  }
  const banks = [...new Set(metadata.map(inferInstitution).filter((bank) => bank !== 'Other'))];
  const institution = banks.length === 1 ? banks[0] : banks.length > 1 ? 'Other' : tdAccountLayout ? 'TD' : inferInstitution(fileName);
  const accountSignals = metadata.join(' ').toLowerCase();
  const cardSignal = /\b(credit card|visa|mastercard|amex|american express|cobalt)\b/.test(accountSignals) ||
    headers.some((header) => /^(card number|card member|cardmember|cardmember name|credit card number)$/.test(normalizeText(header)));
  const bankSignal = /\b(chequing|checking|savings|bank account|current account|money market)\b/.test(accountSignals);
  const fileCard = /\b(card|visa|mastercard|amex|cobalt)\b/.test(normalizeText(fileName));
  const fileBank = /\b(chequing|checking|savings)\b/.test(normalizeText(fileName));
  const accountKind: AccountKind = cardSignal !== bankSignal ? (cardSignal ? 'card' : 'bank')
    : !cardSignal && fileCard !== fileBank ? (fileCard ? 'card' : 'bank') : inferAccountKind(institution);
  const bankEvidence = banks.length === 1 ? 'Bank from file contents' : banks.length > 1 ? 'Conflicting banks; choose bank' : tdAccountLayout ? 'TD-style accountactivity export; confirm bank and account type' : institution !== 'Other' ? 'Bank from filename' : 'Bank not detected';
  const typeEvidence = cardSignal !== bankSignal ? 'account type from file contents' : cardSignal ? 'conflicting account types; confirm selection'
    : fileCard !== fileBank ? 'account type from filename' : institution === 'American Express' ? 'credit card assumed for Amex' : 'account type not detected; confirm selection';
  return { institution, accountKind, detectionNote: bankEvidence + '; ' + typeEvidence + '.' };
}

export function findHeader(headers: string[], choices: string[]): string | undefined {
  const normalized = headers.map((header) => ({
    original: header,
    simple: header.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }));
  for (const choice of choices) {
    const wanted = choice.toLowerCase().replace(/[^a-z0-9]/g, '');
    const exact = normalized.find((item) => item.simple === wanted);
    if (exact)
      return exact.original;
  }
  for (const choice of choices) {
    const wanted = choice.toLowerCase().replace(/[^a-z0-9]/g, '');
    const partial = normalized.find((item) => item.simple && item.simple.includes(wanted));
    if (partial)
      return partial.original;
  }
  return undefined;
}

export function parseCsvText(text: string): {
  rows: RawTransaction[];
  skipped: number;
} {
  const { grid, headerIndex } = inspectCsv(text);
  const importGrid = headerIndex < 0 && isHeaderlessAccountCsv(grid)
    ? [['Date', 'Description', 'Debit', 'Credit', 'Balance'], ...grid]
    : grid.slice(Math.max(0, headerIndex));
  const parsed = Papa.parse<Record<string, string>>(Papa.unparse(importGrid), {
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
    }
    else if (amountHeader) {
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

export function parseOfx(text: string): {
  rows: RawTransaction[];
  skipped: number;
  currency: string;
  account: string;
} {
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
    if (!date || !description || !parsedAmount)
      continue;
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

export function prepareImports(batches: ImportBatch[], existing: Transaction[], rules: Record<string, string>) {
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
      if (batch.format === 'CSV' && batch.accountKind === 'card' && !raw.signNormalized)
        amount = -amount;
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
