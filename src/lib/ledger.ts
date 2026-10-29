import type { Transaction } from '../types';
import {
  TRANSFER_CATEGORIES,
  currentCategory,
  inferIncomeCategory,
  reconcileTransfers,
} from './categories';
import { hashString, normalizeText } from './format';

export function transactionKey(transaction: Pick<Transaction, 'date' | 'postedDate' | 'description' | 'amount' | 'currency' | 'accountName' | 'institution' | 'externalId'>): string {
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

export function budgetRowKey(kind: 'expense' | 'income', date: string, amount: number, description: string): string {
  return hashString([kind, date, amount.toFixed(2), normalizeText(description)].join('|'));
}

export function transactionsForMonth<T extends {
  date: string;
}>(rows: T[], month: string): T[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return [];
  return rows.filter((item) => item.date.slice(0, 7) === month);
}

export function summarizeSpending(transactions: Transaction[], month: string, rules: Record<string, string>) {
  const groups = new Map<string, {
    currency: string;
    charges: number;
    refunds: number;
    income: number;
    unknownCredits: number;
    pending: number;
    excluded: number;
    categories: Record<string, number>;
    largestCharges: {
      id: string;
      description: string;
      amount: number;
      category: string;
    }[];
  }>();
  if (!/^\d{4}-\d{2}$/.test(month))
    return [];
  for (const item of reconcileTransfers(transactions, rules)) {
    if (item.date.slice(0, 7) !== month || !Number.isFinite(item.amount))
      continue;
    const currency = item.currency || 'CAD';
    let group = groups.get(currency);
    if (!group) {
      group = { currency, charges: 0, refunds: 0, income: 0, unknownCredits: 0, pending: 0, excluded: 0, categories: {}, largestCharges: [] };
      groups.set(currency, group);
    }
    // Refresh automatic classifications for the total without editing saved rows.
    const category = currentCategory(item, rules);
    const isRefund = category === 'Income' && (item.incomeCategory ?? inferIncomeCategory(item.description)) === 'Refunds';
    if (category === 'Income' && !isRefund)
      group.income += Math.round(item.amount * 100);
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
    else if (category !== 'Uncategorized')
      group.refunds += cents;
    if (category === 'Uncategorized') {
      if (cents < 0)
        group.pending -= cents;
      else
        group.unknownCredits += cents;
    }
    else {
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
