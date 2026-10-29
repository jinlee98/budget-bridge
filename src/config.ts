import type { Institution } from './types';

export const STORAGE = {
  transactions: 'morrow.transactions.v1',
  clientId: 'morrow.google.clientId',
  sheetUrl: 'morrow.google.sheetUrl',
  tabName: 'morrow.google.tabName',
  rules: 'morrow.categoryRules.v1',
  startingBalance: 'morrow.budget.startingBalance',
  expensePlan: 'morrow.budget.expensePlan',
  incomePlan: 'morrow.budget.incomePlan',
};

export const HEADERS = [
  'Date', 'Posted Date', 'Description', 'Amount', 'Currency',
  'Account', 'Bank', 'Category', 'Categorization', 'Shared',
  'People (incl. me)', 'Each person', 'Others owe', 'Import Key',
];

export const DEFAULT_EXPENSE_PLANS = [
  'Food', 'Gifts', 'Health/medical', 'Home',
  'Transportation', 'Personal', 'Pets', 'Utilities', 'Travel', 'Debt',
  'Other',
];

export const DEFAULT_INCOME_PLANS = [
  'Paycheck', 'Bonus', 'Interest', 'Other',
] as const;

export const GOOGLE_MONTHLY_BUDGET_TEMPLATE = 'https://docs.google.com/spreadsheets/d/1X4qtICR-4SztmMrQv2Xogf7bVV46QVzLxO7X8ie9yU4/copy';

export const SHARED_EXPENSE_HEADERS = [
  'Date', 'Description', 'Category', 'Full amount', 'People (incl. me)',
  'Each person', 'Others owe', 'Account', 'Bank', 'Import Key',
];

export const BANKS: Institution[] = ['TD', 'Scotiabank', 'Tangerine', 'American Express', 'Other'];
