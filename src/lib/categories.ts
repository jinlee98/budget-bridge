import type { AccountKind, CategorySource, IncomeCategory, Transaction } from '../types';
import { DEFAULT_EXPENSE_PLANS, DEFAULT_INCOME_PLANS } from '../config';
import { inferAccountKind } from './accounts';
import { normalizeText } from './format';

export const INCOME_CATEGORIES = [...DEFAULT_INCOME_PLANS, 'Refunds'] as const;

export const CATEGORIES = [
  ...DEFAULT_EXPENSE_PLANS, 'Income',
];

export const BOOKKEEPING_CATEGORIES = ['Card payments', 'Savings transfers', 'Investments', 'Transfers & Payments'];

export const LEGACY_CATEGORIES: Record<string, string> = {
  'Food / Groceries': 'Groceries', 'Restaurants & Coffee': 'Food', 'Pets': 'Other',
  'Bills & Utilities': 'Utilities', 'Housing': 'Home',
  'Subscriptions': 'Personal',
  'Health': 'Health/medical', 'Entertainment': 'Personal',
  'Savings & Investments': 'Investments', 'Fees & Interest': 'Debt',
  'Savings': 'Savings transfers', 'Income:Savings': 'Savings transfers',
};

export const CATEGORY_RULES: {
  category: string;
  pattern: RegExp;
}[] = [
    { category: 'Transfers & Payments', pattern: /\b(credit card payment|payment thank you|payment received|visa payment|mastercard payment|mc payment|amex payment|american express payment|payment to amex|payment to american express|payment to card|online banking transfer|account transfer|interac e transfer|e transfer|etransfer)\b/ },
    { category: 'Investments', pattern: /\b(investment|investments|investing|questrade|wealthsimple|tfsa|fhsa|rrsp|brokerage)\b/ },
    { category: 'Debt', pattern: /\b(loan|loans|student loan|line of credit|loc payment|debt|mortgage|interest charged|interest charge|finance charge|annual fee|bank fee|overdraft fee)\b/ },
    { category: 'Travel', pattern: /\b(travel|hotel|hotels|motel|resort|airbnb|vrbo|flight|flights|airline|airlines|airways|air canada|westjet|porter|flair|air transat|lufthansa|expedia|booking com|hilton|marriott|hyatt|fairmont)\b/ },
    { category: 'Other', pattern: /\b(pet|pets|petco|petsmart|pet valu|veterinary|veterinarian|vet clinic)\b/ },
    { category: 'Tuition / School', pattern: /\b(tuition|school|university|college|textbook|textbooks|student fees|campus|ubc|sfu|bcit|kpu|langara)\b/ },
    { category: 'Health/medical', pattern: /\b(health|medical|dental|dentist|pharmacy|physiotherapy|physio|optometrist|hospital|clinic|shoppers drug mart|london drugs)\b/ },
    { category: 'Utilities', pattern: /\b(telus|rogers|bell canada|fido|koodo|freedom mobile|shaw|fortisbc|bc hydro|hydro|utility|utilities|internet|electricity|water bill)\b/ },
    { category: 'Home', pattern: /\b(rent|rental payment|strata|home depot|home hardware|ikea|property tax|home insurance)\b/ },
    { category: 'Gifts', pattern: /\b(gift|gifts|florist|flowers|donation|charity)\b/ },
    { category: 'Personal', pattern: /\b(game|games|gaming|gamestop|steam|steampowered|valve|nintendo|playstation|xbox|epic games|riot games|blizzard|ubisoft|electronic arts|ea games)\b/ },
    { category: 'Groceries', pattern: /\b(grocery|groceries|supermarket|save on foods|t t supermarket|whole foods|costco|safeway|sobeys|loblaws|superstore|no frills|walmart grocery|freshco|farm boy|h mart)\b/ },
    { category: 'Cafe', pattern: /\b(cafe|cafes|coffee|starbucks|tim hortons|tea|bubble tea|pearl fever|alfa tea)\b/ },
    { category: 'Food', pattern: /\b(restaurant|restaurants|mcdonalds|mcdonald s|uber eats|ubereats|doordash|skip the dishes|skipthedishes|a w|subway|pizza|pizz|sushi|bakery|bistro|grill|kitchen|diner|bar|pub|pho|cactus club|haidilao|hotpot|noodle|burger)\b/ },
    { category: 'Personal', pattern: /\b(spotify|netflix|disney|amazon prime|apple com bill|youtube|youtubepremium|hair salon|barber)\b/ },
    { category: 'Shopping', pattern: /\b(amazon|amzn|walmart|target|dollarama|dollar tree|canadian tire|best buy|winners|homesense|uniqlo|sephora|store|stores|shopping|retail)\b/ },
    { category: 'Transportation', pattern: /\b(shell|chevron|esso|petro canada|translink|compass card|uber|lyft|taxi|parking|impark|easypark|transit|gas station|icbc)\b/ },
  ];

export const TRANSFER_CATEGORIES = new Set([...BOOKKEEPING_CATEGORIES, 'Savings & Investments']);

export function sheetCategory(category: string): string {
  return LEGACY_CATEGORIES[category] ?? category;
}

export function migrateBookkeeping(item: Transaction): Transaction {
  const category = item.category === 'Income' && item.incomeCategory === 'Savings' ? 'Savings transfers' : sheetCategory(item.category);
  if (category === item.category && !(TRANSFER_CATEGORIES.has(category) && (item.shared || item.incomeCategory)))
    return item;
  return {
    ...item, category, incomeCategory: category === 'Income' ? item.incomeCategory : undefined,
    shared: TRANSFER_CATEGORIES.has(category) ? false : item.shared
  };
}

export function merchantKey(description: string): string {
  return normalizeText(description)
    .replace(/^(pos|purchase|debit purchase|visa purchase|mastercard purchase)\s+/, '')
    .replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
}

export function isGenericDescription(description: string): boolean {
  return /^(withdrawal|deposit|abm deposit|miscellaneous payment|bill payment|customer transfer(?: dr| cr)?|payment from(?: \d+)?)$/.test(normalizeText(description));
}

export function inferIncomeCategory(description: string): IncomeCategory {
  const text = normalizeText(description);
  if (!/\btax refund\b/.test(text) && /\b(refund|refunds|purchase reversal|return credit)\b/.test(text))
    return 'Refunds';
  if (/\b(bonus|incentive)\b/.test(text))
    return 'Bonus';
  if (/\b(interest)\b/.test(text))
    return 'Interest';
  if (/\b(payroll|paycheque|paycheck|salary|wages)\b/.test(text))
    return 'Paycheck';
  return 'Other';
}

export function categorySelection(item: Pick<Transaction, 'category' | 'incomeCategory' | 'description'>): string {
  if (item.category === 'Income' && item.incomeCategory === 'Savings')
    return 'Savings transfers';
  return item.category === 'Income' ? 'Income:' + (item.incomeCategory ?? inferIncomeCategory(item.description)) : item.category;
}

export function parseCategorySelection(value: string): {
  category: string;
  incomeCategory?: IncomeCategory;
} {
  if (value.startsWith('Income:') && INCOME_CATEGORIES.some((category) => category === value.slice(7))) {
    return { category: 'Income', incomeCategory: value.slice(7) as IncomeCategory };
  }
  return { category: sheetCategory(value), incomeCategory: undefined };
}

export function categoryLabel(item: Pick<Transaction, 'category' | 'incomeCategory' | 'description'>): string {
  return categorySelection(item).replace('Income:', 'Income / ');
}

export function categorize(description: string, rules: Record<string, string>, amount: number, accountKind?: AccountKind): {
  category: string;
  incomeCategory?: IncomeCategory;
  source: CategorySource;
} {
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
  if (ownSavingsTransfer)
    return { category: /\bsavings\b/.test(text) ? 'Savings transfers' : 'Transfers & Payments', source: 'Rule' };
  if (CATEGORY_RULES[0].pattern.test(text))
    return { category: 'Transfers & Payments', source: 'Rule' };
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
  if (match)
    return { category: match.category, source: 'Rule' };
  return { category: 'Uncategorized', source: 'Uncategorized' };
}

export function transactionAccountKind(item: Transaction): AccountKind {
  return item.accountKind ?? (/\bcard\b/i.test(item.accountName) ? 'card' : inferAccountKind(item.institution));
}

export function refreshSuggestions(transactions: Transaction[], rules: Record<string, string>): Transaction[] {
  return transactions.map((item) => {
    if (item.categorySource === 'Manual')
      return item;
    const suggestion = categorize(item.description, rules, item.amount, transactionAccountKind(item));
    return {
      ...item, category: suggestion.category, incomeCategory: suggestion.incomeCategory, categorySource: suggestion.source,
      shared: item.shared && item.amount < 0 && suggestion.category !== 'Income' && !TRANSFER_CATEGORIES.has(suggestion.category),
    };
  });
}

export function currentCategory(item: Transaction, rules: Record<string, string>): string {
  if (item.category === 'Income' && item.incomeCategory === 'Savings')
    return 'Savings transfers';
  if (item.categorySource === 'Manual' || TRANSFER_CATEGORIES.has(item.category))
    return sheetCategory(item.category);
  const suggestion = categorize(item.description, rules, item.amount, transactionAccountKind(item)).category;
  return sheetCategory(suggestion === 'Uncategorized' ? item.category : suggestion);
}

export function reconcileTransfers(transactions: Transaction[], rules: Record<string, string>): Transaction[] {
  const rows = transactions.map((item) => {
    item = migrateBookkeeping(item);
    if (item.categorySource === 'Manual')
      return item;
    const accountKind = transactionAccountKind(item);
    const suggestion = categorize(item.description, rules, item.amount, accountKind);
    if (suggestion.category === 'Uncategorized' && !isGenericDescription(item.description))
      return item;
    return { ...item, category: suggestion.category, incomeCategory: suggestion.incomeCategory, categorySource: suggestion.source };
  });
  const candidates = new Map<number, Set<number>>();
  const canMatch = (item: Transaction) => TRANSFER_CATEGORIES.has(item.category) ||
    (item.categorySource !== 'Manual' && (isGenericDescription(item.description) || normalizeText(item.description) === 'scotiabank transit'));
  for (let i = 0; i < rows.length; i += 1) {
    const seed = rows[i];
    if (!TRANSFER_CATEGORIES.has(seed.category) || seed.amount === 0)
      continue;
    for (let j = 0; j < rows.length; j += 1) {
      const other = rows[j];
      if (i === j || !canMatch(other) || (seed.institution === other.institution && seed.accountName === other.accountName))
        continue;
      if ((seed.currency || 'CAD') !== (other.currency || 'CAD') || Math.round(seed.amount * 100) !== -Math.round(other.amount * 100))
        continue;
      const gap = Math.abs(Date.parse(seed.date) - Date.parse(other.date));
      if (!Number.isFinite(gap) || gap > 3 * 86400000)
        continue;
      if (!candidates.has(i))
        candidates.set(i, new Set());
      if (!candidates.has(j))
        candidates.set(j, new Set());
      candidates.get(i)!.add(j);
      candidates.get(j)!.add(i);
    }
  }
  // Match only unique pairs, supported by an explicit payment/transfer on one side.
  return rows.map((item, index) => {
    const matches = candidates.get(index);
    const partner = matches?.size === 1 ? [...matches][0] : undefined;
    if (partner === undefined || candidates.get(partner)?.size !== 1 || item.categorySource === 'Manual')
      return item;
    const partnerCategory = rows[partner].category;
    const category = item.category === 'Card payments' || partnerCategory === 'Card payments' ? 'Card payments'
      : item.category === 'Savings transfers' || partnerCategory === 'Savings transfers' ? 'Savings transfers'
        : item.category === 'Investments' || partnerCategory === 'Investments' ? 'Investments' : 'Transfers & Payments';
    return { ...item, category, incomeCategory: undefined, categorySource: 'Rule', shared: false };
  });
}

export function budgetImpact(item: Transaction, rules: Record<string, string>): string {
  const category = currentCategory(item, rules);
  if (category === 'Income' && (item.incomeCategory ?? inferIncomeCategory(item.description)) === 'Refunds')
    return item.amount >= 0 ? 'Reduces spending · refund' : 'Spending · refund reversal';
  if (category === 'Income')
    return 'Income · not spending';
  if (TRANSFER_CATEGORIES.has(category))
    return 'Excluded · transfer / investment';
  if (category === 'Uncategorized')
    return item.amount < 0 ? 'Included · needs review' : 'Excluded · unknown deposit';
  return item.amount < 0 ? 'Spending' : 'Reduces spending';
}

export function categoryGroup(category: string): 'expense' | 'income' | 'bookkeeping' | 'uncategorized' {
  if (category === 'group:expense')
    return 'expense';
  if (category === 'group:income')
    return 'income';
  if (category === 'group:bookkeeping')
    return 'bookkeeping';
  if (category === 'Uncategorized')
    return 'uncategorized';
  if (category === 'Income' || category.startsWith('Income:'))
    return 'income';
  return TRANSFER_CATEGORIES.has(category) || category === 'All categories'
    ? 'bookkeeping' : 'expense';
}

export function matchesCategoryFilter(item: Transaction, filter: string): boolean {
  if (filter.startsWith('group:'))
    return categoryGroup(item.category) === filter.slice(6);
  return filter === 'All categories' || item.category === filter || categorySelection(item) === filter;
}
