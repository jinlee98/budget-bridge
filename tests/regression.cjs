const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Load production TypeScript modules using the project's ES2020 target.
const previousLoader = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  module._compile(compiled, filename);
};
let context;
try {
  context = { exports: {
    ...require('../src/lib/imports.ts'),
    ...require('../src/lib/categories.ts'),
    ...require('../src/lib/ledger.ts'),
    ...require('../src/lib/sheets.ts'),
  } };
} finally {
  if (previousLoader) require.extensions['.ts'] = previousLoader;
  else delete require.extensions['.ts'];
}
const { parseCsvText, parseOfx, discoverTransactionSections, findTemplatePlannedUpdates } = context.exports;

const csv = parseCsvText('Date,Description,Debit,Credit,\n2026-10-01,Shop,12.50,,\n2026-10-02,Refund,,3.25,\n2026-10-03,Invalid,,,');
assert.equal(csv.rows.length, 2);
assert.equal(csv.skipped, 1);
assert.equal(csv.rows[0].amount, -12.5);
assert.equal(csv.rows[1].amount, 3.25);
assert.equal(csv.rows[0].signNormalized, true);
// Empty trailing headers must never masquerade as an amount or ID column.
const simple = parseCsvText('Date,Description,Amount,\n2026-10-01,Shop,12.50,');
assert.equal(simple.rows[0].amount, 12.5);
assert.equal(simple.rows[0].externalId, '');
assert.equal(simple.rows[0].signNormalized, false);

const ofx = parseOfx('<OFX><CURDEF>CAD<ACCTID>1234<BANKTRANLIST><STMTTRN><DTPOSTED>20261001<TRNAMT>-12.50<FITID>abc<NAME>Shop</STMTTRN></BANKTRANLIST></OFX>');
assert.equal(ofx.rows[0].amount, -12.5);
assert.equal(ofx.rows[0].externalId, 'abc');

const sections = discoverTransactionSections([['Expenses', '', '', '', '', 'Income'], ['Date', 'Amount', 'Description', 'Category', '', 'Date', 'Amount', 'Description', 'Category']]);
assert.equal(sections.length, 2);
assert.equal(sections[1].columns.date, 5);
assert.equal(sections[1].kind, 'income');

const summary = [[], ['Expenses', '', '', '', '', '', '', 'Income'], ['', 'Planned', '', '', '', '', '', '', 'Planned'], ['Food', '', '', '', '', '', '', 'Paycheck']];
assert.equal(findTemplatePlannedUpdates(summary, '', { Food: '' }, { Paycheck: '' }).length, 0);
const updates = findTemplatePlannedUpdates(summary, '', { Food: '0' }, { Paycheck: '2500' });
assert.equal(updates.length, 2);
assert.equal(updates[0].range, 'Summary!B4');
assert.equal(updates[0].values[0][0], 0);
assert.equal(updates[1].range, 'Summary!I4');
assert.equal(updates[1].values[0][0], 2500);
console.log('Regression checks passed: CSV signs and invalid rows, OFX, template sections, blank/zero plans, sparse Summary rows.');

const { prepareImports } = context.exports;
const batch = { id: 'one', fileName: 'test.csv', institution: 'TD', accountKind: 'bank', currency: 'CAD', rows: simple.rows, skipped: 0, format: 'CSV' };
const all = prepareImports([batch, { ...batch, id: 'two' }], [], {});
assert.equal(all.next.length, 1);
assert.equal(all.duplicateCount, 1);
assert.equal(all.next[0].accountName, 'TD account');
const legacy = { ...all.next[0], accountName: 'TD Chequing', importKey: 'old-key', accountKind: undefined };
const again = prepareImports([batch], [legacy], {});
assert.equal(again.next.length, 0);
assert.equal(legacy.importKey, 'old-key');
const card = prepareImports([{ ...batch, accountKind: 'card' }], [], {}).next[0];
assert.equal(card.amount, -12.5);
assert.equal(card.accountName, 'TD card');
const normalized = prepareImports([{ ...batch, accountKind: 'card', rows: csv.rows }], [], {});
assert.equal(normalized.next[0].amount, -12.5);
assert.equal(normalized.next[1].amount, 3.25);
assert.equal(prepareImports([{ ...batch, accountKind: 'card', format: 'QFX / OFX', rows: ofx.rows }], [], {}).next[0].amount, -12.5);
console.log('Bulk import checks passed: duplicates across files and old labels, automatic account names, CSV card signs, normalized debit/credit and OFX signs.');

const { detectImportSource } = context.exports;
const preamble = 'Bank,TD Canada Trust\nAccount Type,Chequing\nDate,Description,Amount\n2026-10-01,"Shop, downtown",-12.50';
const detected = detectImportSource(preamble, 'amex.csv', false);
assert.equal(detected.institution, 'TD');
assert.equal(detected.accountKind, 'bank');
assert.equal(parseCsvText(preamble).rows[0].description, 'Shop, downtown');
assert.equal(parseCsvText(preamble).rows[0].amount, -12.5);
const columns = 'Date,Description,Amount,Bank,Account Type\n2026-10-01,Shop,12.50,Scotiabank,Visa';
assert.equal(detectImportSource(columns, 'export.csv', false).institution, 'Scotiabank');
assert.equal(detectImportSource(columns, 'export.csv', false).accountKind, 'card');
const merchants = 'Date,Description,Amount\n2026-10-01,TD credit card payment,-12.50\n2026-10-02,Tangerine transfer,-30';
assert.equal(detectImportSource(merchants, 'export.csv', false).institution, 'Other');
assert.match(detectImportSource(merchants, 'export.csv', false).detectionNote, /account type not detected/);
assert.equal(detectImportSource(merchants, 'scotia_visa.csv', false).accountKind, 'card');
assert.equal(detectImportSource(merchants, 'budgetdownload.csv', false).institution, 'Other');
const conflicts = columns + '\n2026-10-02,Shop,10,TD,Chequing';
assert.equal(detectImportSource(conflicts, 'export.csv', false).institution, 'Other');
assert.match(detectImportSource(conflicts, 'export.csv', false).detectionNote, /conflicting account types/);
const tagged = '<OFX><ORG>Tangerine<BANKACCTFROM><ACCTTYPE>SAVINGS<BANKTRANLIST><STMTTRN><NAME>AMEX PAYMENT';
assert.equal(detectImportSource(tagged, 'export.ofx', true).institution, 'Tangerine');
assert.equal(detectImportSource(tagged, 'export.ofx', true).accountKind, 'bank');
assert.equal(detectImportSource('<OFX><ORG>TD<CCACCTFROM><ACCTID>123', 'export.qfx', true).accountKind, 'card');
console.log('Source detection checks passed: metadata precedence, header preambles, structured columns, filename fallback, conflicts, OFX account tags, and ignored merchant descriptions.');

const { categorize, refreshSuggestions, sheetCategory, merchantKey, templateCategory, budgetRowKey } = context.exports;
const categoryCases = [
  ['PAYROLL DEPOSIT ACME', 2400, 'Income'],
  ['PAYROLL REVERSAL', -2400, 'Uncategorized'],
  ['Interest earned', 12, 'Income'],
  ['Wealthsimple dividend', 15, 'Income'],
  ['LOANS PAYMENT', -250, 'Debt'],
  ['Student loan repayment', -300, 'Debt'],
  ['Mortgage payment', -1500, 'Debt'],
  ['Loan proceeds', 5000, 'Transfers & Payments'],
  ['TFSA investment transfer', -200, 'Investments'],
  ['Questrade', -100, 'Investments'],
  ['Personal investment contribution', -100, 'Investments'],
  ['EPIC GAMES', -30, 'Personal'],
  ['STEAM PURCHASE 12345', -20, 'Personal'],
  ['Game company', -15, 'Personal'],
  ['Air Canada', -350, 'Travel'],
  ['WestJet', -300, 'Travel'],
  ['AIRBNB RESERVATION', -120, 'Travel'],
  ['Hotel California', -200, 'Travel'],
  ['Amazon Marketplace', -23, 'Personal'],
  ['AMZN MKTP CA', -24, 'Personal'],
  ['Starbucks #123', -6, 'Personal'],
  ['UBER EATS', -25, 'Personal'],
  ['UBER TRIP', -18, 'Transportation'],
  ['Whole Foods', -100, 'Food / Groceries'],
  ['BC Hydro', -50, 'Utilities'],
  ['Rent', -1500, 'Home'],
  ['Petsmart', -50, 'Pets'],
  ['Dental clinic', -100, 'Health/medical'],
  ['Flowers gift', -30, 'Gifts'],
  ['Amazon credit card payment', -300, 'Card payments'],
  ['Parent transfer reference', -30, 'Uncategorized'],
  ['Shellshock game', -20, 'Personal'],
  ['Unknown merchant', 20, 'Uncategorized'],
];
for (const [description, amount, expected] of categoryCases) {
  assert.equal(categorize(description, {}, amount).category, expected, description);
}
assert.equal(categorize('Starbucks', { starbucks: 'Gifts' }, -6).category, 'Gifts');
assert.equal(categorize('Starbucks', { starbucks: 'Restaurants & Coffee' }, -6).category, 'Personal');
const learned = { ['merchant:' + merchantKey('POS Starbucks 123')]: 'Gifts' };
assert.equal(categorize('POS Starbucks 456', learned, -6).category, 'Gifts');
assert.equal(sheetCategory('Groceries'), 'Food / Groceries');
assert.equal(sheetCategory('Food'), 'Food / Groceries');
assert.equal(templateCategory('Food / Groceries', 'Whole Foods', []), 'Food / Groceries');
assert.equal(context.exports.budgetImpact({ ...all.next[0], category: 'Income', incomeCategory: 'Paycheck', categorySource: 'Manual' }, {}), 'Income · not spending');
assert.equal(sheetCategory('Savings & Investments'), 'Investments');
assert.equal(templateCategory('Personal', 'Amazon', []), 'Personal');
assert.equal(templateCategory('Income', 'Payroll deposit', ['Paycheck', 'Other']), 'Paycheck');
const oldRows = [
  { ...all.next[0], description: 'Payroll deposit', amount: 2000, category: 'Uncategorized', categorySource: 'Uncategorized' },
  { ...all.next[0], id: 'manual', category: 'Gifts', categorySource: 'Manual' },
  { ...all.next[0], id: 'investment', description: 'Investment contribution', amount: -200, shared: true, category: 'Other', categorySource: 'Rule' },
];
const refreshed = refreshSuggestions(oldRows, {});
assert.equal(refreshed[0].category, 'Income');
assert.equal(refreshed[0].importKey, oldRows[0].importKey);
assert.equal(refreshed[1], oldRows[1]);
assert.equal(refreshed[2].category, 'Investments');
assert.equal(refreshed[2].shared, false);
assert.equal(oldRows[0].category, 'Uncategorized');
assert.notEqual(budgetRowKey('expense', '2026-10-01', 20, 'Shop'), budgetRowKey('income', '2026-10-01', 20, 'Shop'));
console.log('Category checks passed: sign-aware payroll, debt, investments, travel, merchants, word boundaries, learned overrides, legacy names, refresh preservation, and budget row identity.');

const { parseCategorySelection, categorySelection, categoryLabel } = context.exports;
for (const income of ['Paycheck', 'Bonus', 'Interest', 'Other', 'Refunds']) {
  const selected = parseCategorySelection('Income:' + income);
  assert.equal(selected.category, 'Income');
  assert.equal(selected.incomeCategory, income);
  assert.equal(templateCategory(selected.category, 'Unusual deposit', [income], selected.incomeCategory), income);
  const row = { ...all.next[0], ...selected, description: 'Unusual deposit', categorySource: 'Manual' };
  assert.equal(categorySelection(row), 'Income:' + income);
  assert.equal(categoryLabel(row), 'Income / ' + income);
  assert.equal(refreshSuggestions([row], {})[0], row);
  assert.equal(categorize('Unusual deposit', { 'unusual deposit': 'Income:' + income }, 200).incomeCategory, income);
}
assert.equal(parseCategorySelection('Other').category, 'Other');
assert.equal(parseCategorySelection('Other').incomeCategory, undefined);
assert.equal(categorize('Payroll deposit', {}, 2000).incomeCategory, 'Paycheck');
assert.equal(categorize('Annual bonus', {}, 500).incomeCategory, 'Bonus');
assert.equal(categorize('Interest earned', {}, 5).incomeCategory, 'Interest');
assert.equal(categorize('Dividend', {}, 20).incomeCategory, 'Other');
assert.equal(categorySelection({ category: 'Income', description: 'Payroll deposit' }), 'Income:Paycheck');
assert.equal(templateCategory('Income', 'Savings deposit', ['Savings', 'Other']), 'Other');
console.log('Income category checks passed: all five selections, learned rules, manual preservation, distinct Other categories, payroll/bonus/interest suggestions, legacy rows, and sheet mapping.');

const { summarizeSpending, categoryGroup } = context.exports;
const spendingRow = (amount, category, extra = {}) => ({ ...all.next[0], date: '2026-10-01', description: 'Unknown merchant', amount, category, categorySource: 'Manual', ...extra });
const spendingRows = [
  spendingRow(-100, 'Personal', { shared: true, splitCount: 2 }),
  spendingRow(20, 'Personal'),
  spendingRow(-2000, 'Transfers & Payments'),
  spendingRow(-500, 'Investments'),
  spendingRow(-1000, 'Income'),
  spendingRow(-3000, 'Uncategorized', { description: 'Credit card payment', categorySource: 'Uncategorized' }),
  spendingRow(-100, 'Uncategorized', { description: 'TFSA contribution', categorySource: 'Uncategorized' }),
  spendingRow(-30, 'Uncategorized'),
  spendingRow(1000, 'Uncategorized'),
  spendingRow(-5000, 'Personal', { date: '2026-09-30' }),
  spendingRow(-10, 'Personal', { currency: 'USD' }),
  spendingRow(-5, 'Personal', { description: 'Credit card payment' }), // Manual choices take priority.
];
const spendingSummary = summarizeSpending(spendingRows, '2026-10', {});
assert.equal(spendingSummary.length, 2);
assert.equal(spendingSummary[0].currency, 'CAD');
assert.equal(spendingSummary[0].charges, 135);
assert.equal(spendingSummary[0].refunds, 20);
assert.equal(spendingSummary[0].net, 115);
assert.equal(spendingSummary[0].pending, 30);
assert.equal(spendingSummary[0].excluded, 5);
assert.equal(spendingSummary[0].largestCharges[0].amount, 100);
assert.equal(spendingSummary[1].currency, 'USD');
assert.equal(spendingSummary[1].net, 10);
assert.equal(summarizeSpending(spendingRows, '', {}).length, 0);
assert.equal(summarizeSpending([spendingRow(25, 'Food')], '2026-10', {})[0].net, -25);
assert.equal(spendingRows[5].category, 'Uncategorized');
assert.equal(categoryGroup('Food'), 'expense');
assert.equal(categoryGroup('Investments'), 'bookkeeping');
assert.equal(categoryGroup('Income:Other'), 'income');
assert.equal(categoryGroup('Transfers & Payments'), 'bookkeeping');
assert.equal(categorize('AMEX PAYMENT', {}, -4000).category, 'Card payments');
console.log('Overview checks passed: refunds, month boundaries, stale automatic transfer/investment categories, income exclusion, manual priority, shared full charges, provisional unknown charges, and separate currencies.');

const { budgetImpact } = context.exports;
for (const description of ['VISA PMT', 'TD VISA BILL PAYMENT', 'PAYMENT AMERICAN EXPRESS', 'MASTERCARD PYMT', 'SAVINGS TRANSFER', 'TFR TO CHEQUING']) {
  const expected = description === 'SAVINGS TRANSFER' ? 'Savings transfers' : description === 'TFR TO CHEQUING' ? 'Transfers & Payments' : 'Card payments';
  assert.equal(categorize(description, {}, -1000).category, expected, description);
  assert.equal(categorize(description, {}, 1000).category, expected, description);
}
assert.equal(categorize('AMEX', {}, -2000, 'bank').category, 'Card payments');
assert.equal(categorize('AMEX', {}, -20, 'card').category, 'Uncategorized');
assert.equal(categorize('VISA interest charged', {}, -10).category, 'Debt');
assert.equal(categorize('Savings interest earned', {}, 5).incomeCategory, 'Interest');
const cardAndBank = [
  spendingRow(-100, 'Personal', { accountKind: 'card', description: 'Amazon' }),
  spendingRow(-100, 'Uncategorized', { accountKind: 'bank', categorySource: 'Uncategorized', description: 'VISA PMT' }),
  spendingRow(100, 'Uncategorized', { accountKind: 'card', categorySource: 'Uncategorized', description: 'PAYMENT RECEIVED' }),
  spendingRow(-500, 'Uncategorized', { accountKind: 'bank', categorySource: 'Uncategorized', description: 'TRANSFER TO SAVINGS' }),
  spendingRow(500, 'Uncategorized', { accountKind: 'bank', categorySource: 'Uncategorized', description: 'TRANSFER FROM CHEQUING' }),
];
assert.equal(summarizeSpending(cardAndBank, '2026-10', {})[0].net, 100);
assert.equal(summarizeSpending(cardAndBank.slice(0, 2), '2026-10', {})[0].net, 100);
assert.match(budgetImpact(cardAndBank[1], {}), /^Excluded/);
assert.equal(budgetImpact(cardAndBank[0], {}), 'Spending');
assert.equal(budgetImpact(spendingRow(-10, 'Uncategorized'), {}), 'Included · needs review');
console.log('Reconciliation checks passed: card purchase counted once, both payment sides excluded, own savings transfers excluded, lone bill payments excluded, financing costs retained, and visible budget impact.');

const { reconcileTransfers } = context.exports;
const paymentRow = (description, amount, accountKind, extra = {}) => spendingRow(amount, 'Uncategorized', {
  description, accountKind, accountName: accountKind === 'card' ? 'Example card' : 'Example account', categorySource: 'Uncategorized', ...extra,
});
const matchingRows = [
  paymentRow('miscellaneous payment', -510.12, 'bank'),
  paymentRow('PAYMENT RECEIVED - THANK YOU', 510.12, 'card'),
  paymentRow('customer transfer dr.', -120.34, 'bank'),
  paymentRow('payment from - *****12*82', 120.34, 'card'),
  paymentRow('miscellaneous payment', -240.56, 'bank'),
  paymentRow('PAYMENT RECEIVED - THANK YOU', 240.56, 'card'),
  paymentRow('crd. card bill payment', -85.67, 'bank'),
  paymentRow('scotiabank transit', 85.67, 'card'),
  paymentRow('withdrawal', -3000, 'bank'),
  paymentRow('deposit', 3000, 'card'),
  paymentRow('withdrawal', -4.20, 'bank', { category: 'Personal', categorySource: 'Manual' }),
];
const reconciled = reconcileTransfers(matchingRows, { withdrawal: 'Personal' });
for (let i = 0; i < 8; i += 1) assert.equal(reconciled[i].category, 'Card payments', matchingRows[i].description);
assert.equal(reconciled[8].category, 'Uncategorized'); // Amount equality alone is not transfer evidence.
assert.equal(reconciled[9].incomeCategory, 'Refunds'); // Unmatched card credit defaults to a refund.
assert.equal(reconciled[10].category, 'Personal');
assert.equal(summarizeSpending(matchingRows, '2026-10', { withdrawal: 'Personal' })[0].net, 4.20);
assert.equal(categorize('withdrawal', { withdrawal: 'Personal' }, -3000).category, 'Uncategorized');
const ambiguousPayments = [paymentRow('VISA PMT', 100, 'card'), paymentRow('miscellaneous payment', -100, 'bank'), paymentRow('miscellaneous payment', -100, 'bank')];
assert.equal(reconcileTransfers(ambiguousPayments, {})[1].category, 'Uncategorized');
assert.equal(reconcileTransfers([paymentRow('VISA PMT', 100, 'card'), paymentRow('miscellaneous payment', -100, 'bank', { currency: 'USD' })], {})[1].category, 'Uncategorized');
assert.equal(reconcileTransfers([paymentRow('VISA PMT', 100, 'card'), paymentRow('miscellaneous payment', -100, 'bank', { date: '2026-10-20' })], {})[1].category, 'Uncategorized');
assert.equal(matchingRows[0].category, 'Uncategorized');
console.log('Paired-payment checks passed: generic bank debits matched to explicit card credits, transit credit corrected, no guess from equal amounts alone, generic rules ignored, manual choices retained, ambiguous/currency/date mismatches rejected.');

assert.equal(parseCategorySelection('Income:Refunds').incomeCategory, 'Refunds');
assert.equal(categorize('Purchase refund', {}, 25).incomeCategory, 'Refunds');
assert.equal(categorize('Tax refund', {}, 25).incomeCategory, 'Other');
assert.equal(categorize('PAYMENT RECEIVED - THANK YOU', {}, 25).category, 'Card payments');
const explicitRefund = spendingRow(25, 'Income', { incomeCategory: 'Refunds' });
assert.equal(summarizeSpending([spendingRow(-100, 'Personal'), explicitRefund], '2026-10', {})[0].net, 75);
assert.equal(summarizeSpending([spendingRow(-25, 'Income', { incomeCategory: 'Refunds' })], '2026-10', {})[0].net, 25);
assert.equal(budgetImpact(explicitRefund, {}), 'Reduces spending · refund');
assert.equal(templateCategory('Income', 'Purchase refund', ['Other'], 'Refunds'), 'Other');
assert.equal(templateCategory('Income', 'Purchase refund', ['Refunds', 'Other'], 'Refunds'), 'Refunds');
assert.equal(refreshSuggestions([explicitRefund], {})[0], explicitRefund);
console.log('Refund checks passed: selectable income category, spending reduction, reversals, tax/payment separation, manual preservation, and template fallback.');

assert.equal(categorize('AMZN MKTP', {}, 25, 'card').incomeCategory, 'Refunds');
assert.equal(categorize('Unknown merchant', {}, 25, 'card').incomeCategory, 'Refunds');
assert.equal(categorize('AMZN MKTP', { 'amzn mktp': 'Personal' }, 25, 'card').incomeCategory, 'Refunds');
assert.equal(categorize('AMZN MKTP', {}, -25, 'card').category, 'Personal');
assert.equal(categorize('Unknown merchant', {}, 25, 'bank').category, 'Uncategorized');
assert.equal(categorize('PAYMENT', {}, 25, 'card').category, 'Card payments');
assert.equal(categorize('PAYMENT REVERSAL', {}, 25, 'card').incomeCategory, 'Refunds');
const rawCardRefund = { ...simple.rows[0], amount: -25 };
const importedCardRefund = prepareImports([{ ...batch, accountKind: 'card', rows: [rawCardRefund] }], [], {}).next[0];
assert.equal(importedCardRefund.amount, 25);
assert.equal(importedCardRefund.incomeCategory, 'Refunds');
assert.equal(importedCardRefund.category, 'Income');
console.log('Card credit checks passed: raw-export sign normalization, default refunds, merchant-rule priority, payments excluded, purchases retained, and bank deposits unchanged.');

const { migrateBookkeeping } = context.exports;
const legacySavings = spendingRow(500, 'Income', { incomeCategory: 'Savings', shared: true });
const movedSavings = migrateBookkeeping(legacySavings);
assert.equal(movedSavings.category, 'Savings transfers');
assert.equal(movedSavings.incomeCategory, undefined);
assert.equal(movedSavings.amount, 500);
assert.equal(movedSavings.importKey, legacySavings.importKey);
assert.equal(movedSavings.id, legacySavings.id);
assert.equal(movedSavings.categorySource, 'Manual');
assert.equal(movedSavings.shared, false);
assert.equal(legacySavings.category, 'Income');
assert.equal(parseCategorySelection('Income:Savings').category, 'Savings transfers');
assert.equal(categorize('TRANSFER TO SAVINGS', {}, -500).category, 'Savings transfers');
assert.equal(categorize('Investment contribution', {}, -500).category, 'Investments');
assert.equal(categoryGroup('Savings transfers'), 'bookkeeping');
assert.equal(categoryGroup('Card payments'), 'bookkeeping');
assert.equal(summarizeSpending([legacySavings, spendingRow(-200, 'Investments'), spendingRow(-300, 'Card payments')], '2026-10', {})[0].net, 0);
assert.equal(findTemplatePlannedUpdates(summary, '', {}, { Savings: '500' }).length, 0);
console.log('Bookkeeping migration checks passed: savings reclassified without amount/key changes, blue bookkeeping groups, zero spending impact, and old savings plans skipped.');

const { transactionsForMonth } = context.exports;
const monthRows = ['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01', '2025-10-15'].map((date) => spendingRow(-10, 'Personal', { date }));
assert.equal(transactionsForMonth(monthRows, '2026-10').length, 2);
assert.equal(transactionsForMonth(monthRows, '2026-09').length, 1);
assert.equal(transactionsForMonth(monthRows, '').length, 0);
assert.equal(transactionsForMonth(monthRows, '2026-13').length, 0);
const previousWeek = { ...batch, rows: [{ ...simple.rows[0], date: '2026-09-30' }, { ...simple.rows[0], date: '2026-10-01' }] };
const weekOne = prepareImports([previousWeek], [], {});
const weekTwo = prepareImports([{ ...previousWeek, fileName: 'new-export.csv', rows: [{ ...simple.rows[0], date: '2026-10-01' }, { ...simple.rows[0], date: '2026-10-07' }] }], weekOne.next, {});
assert.equal(weekTwo.duplicateCount, 1);
assert.equal(transactionsForMonth([...weekOne.next, ...weekTwo.next], '2026-10').length, 2);
const crossMonthPayments = [paymentRow('miscellaneous payment', -100, 'bank', { date: '2026-09-30' }), paymentRow('VISA PMT', 100, 'card', { date: '2026-10-01' })];
assert.equal(transactionsForMonth(reconcileTransfers(crossMonthPayments, {}), '2026-10')[0].category, 'Card payments');
assert.equal(transactionsForMonth(reconcileTransfers(crossMonthPayments, {}), '2026-09')[0].category, 'Card payments');
console.log('Calendar-month checks passed: exact month/year boundaries, invalid month rejection, overlapping weekly imports, and cross-month payment matching before upload filtering.');

const overviewRows = [
  spendingRow(3000, 'Income', { incomeCategory: 'Paycheck' }),
  spendingRow(-2000, 'Personal'),
  spendingRow(100, 'Income', { incomeCategory: 'Refunds' }),
  spendingRow(500, 'Uncategorized'),
  spendingRow(-500, 'Savings transfers'),
  spendingRow(500, 'Savings transfers'),
  spendingRow(50, 'Income', { currency: 'USD', incomeCategory: 'Bonus' }),
  spendingRow(-10, 'Personal', { currency: 'USD' }),
  spendingRow(9000, 'Income', { incomeCategory: 'Paycheck', date: '2026-09-30' }),
];
const overviewSummary = summarizeSpending(overviewRows, '2026-10', {});
assert.equal(overviewSummary[0].income, 3000);
assert.equal(overviewSummary[0].net, 1900);
assert.equal(overviewSummary[0].remaining, 1100);
assert.equal(overviewSummary[0].unknownCredits, 500);
assert.equal(overviewSummary[1].income, 50);
assert.equal(overviewSummary[1].remaining, 40);
assert.equal(summarizeSpending([spendingRow(-25, 'Income', { incomeCategory: 'Paycheck' })], '2026-10', {})[0].income, -25);
assert.equal(summarizeSpending([spendingRow(-50, 'Personal')], '2026-10', {})[0].remaining, -50);
console.log('Income and remaining checks passed: income minus net spending, refunds counted once, unknown deposits excluded, transfers excluded, reversals, negative remaining, month and currency isolation.');

const { matchesCategoryFilter } = context.exports;
assert.equal(matchesCategoryFilter(spendingRow(-10, 'Food / Groceries'), 'group:expense'), true);
assert.equal(matchesCategoryFilter(spendingRow(10, 'Income', { incomeCategory: 'Paycheck' }), 'group:income'), true);
assert.equal(matchesCategoryFilter(spendingRow(10, 'Income', { incomeCategory: 'Refunds' }), 'group:income'), true);
assert.equal(matchesCategoryFilter(spendingRow(10, 'Income', { incomeCategory: 'Refunds' }), 'Income:Paycheck'), false);
for (const category of ['Investments', 'Savings transfers', 'Card payments', 'Transfers & Payments']) {
  assert.equal(matchesCategoryFilter(spendingRow(-10, category), 'group:bookkeeping'), true);
  assert.equal(matchesCategoryFilter(spendingRow(-10, category), 'group:expense'), false);
}
assert.equal(matchesCategoryFilter(spendingRow(-10, 'Uncategorized'), 'group:bookkeeping'), false);
assert.equal(matchesCategoryFilter(spendingRow(-10, 'Uncategorized'), 'Uncategorized'), true);
assert.equal(matchesCategoryFilter(spendingRow(-10, 'Personal'), 'All categories'), true);
assert.equal(categoryGroup('group:income'), 'income');
console.log('Group filter checks passed: selectable expense/income/bookkeeping groups, specific subcategories, separate uncategorized, and income-filter inclusion of refunds without income-total double counting.');

const { SUMMARY_LAYOUT, summaryCategories, findFoodCategoryRepairs } = context.exports;
const newSummary = Array.from({ length: 40 }, () => Array(12).fill(''));
newSummary[5][9] = 'Starting balance'; // Label is not beside the input.
newSummary[7][11] = 123;
const expenseLabels = ['Food / Groceries', 'Gifts', 'Health/medical', 'Home', 'Transportation', 'Personal', 'Pets', 'Utilities', 'Travel', 'Debt', 'Other'];
const incomeLabels = ['Savings', 'Paycheck', 'Bonus', 'Interest', 'Other', 'Refunds'];
expenseLabels.forEach((label, index) => { newSummary[index + 27][1] = label; newSummary[index + 27][3] = 111; newSummary[index + 27][4] = '=SUM(Transactions!B:B)'; });
incomeLabels.forEach((label, index) => { newSummary[index + 27][7] = label; newSummary[index + 27][9] = 222; });
const preciseSetup = findTemplatePlannedUpdates(newSummary, '1,234.56', { Food: '400', Other: '0' }, { Paycheck: '2500', Other: '' }, [], SUMMARY_LAYOUT);
assert.equal(preciseSetup.length, 4);
assert.equal(preciseSetup[0].range, 'Summary!L8');
assert.equal(preciseSetup[0].values[0][0], 1234.56);
assert.equal(preciseSetup[1].range, 'Summary!D28');
assert.equal(preciseSetup[2].range, 'Summary!D38');
assert.equal(preciseSetup[2].values[0][0], 0);
assert.equal(preciseSetup[3].range, 'Summary!J29');
assert.equal(findTemplatePlannedUpdates(newSummary, '', { Food: '' }, { Paycheck: '' }, [], SUMMARY_LAYOUT).length, 0);
assert.throws(() => findTemplatePlannedUpdates(newSummary, 'invalid', {}, {}, [], SUMMARY_LAYOUT), /Invalid amount/);
assert.throws(() => findTemplatePlannedUpdates(newSummary, '', { Missing: '100' }, {}, [], SUMMARY_LAYOUT), /Could not find/);
assert.equal(newSummary[7][11], 123);
assert.equal(newSummary[27][4], '=SUM(Transactions!B:B)');
assert.equal(summaryCategories(newSummary, 'expense', SUMMARY_LAYOUT)[0], 'Food / Groceries');
assert.equal(templateCategory('Food / Groceries', '', [], undefined, ['Food / Groceries']), 'Food / Groceries');
assert.equal(templateCategory('Food / Groceries', '', [], undefined, ['Food']), 'Food');
const repairGrid = [['Date', 'Amount', 'Description', 'Category'], ['2026-10-01', '10', 'Shop', 'Food'], ['2026-09-30', '12', 'Shop', 'Food'], ['2026-10-02', '13', 'Shop', 'Food / Groceries']];
const repairSections = discoverTransactionSections(repairGrid);
const repairs = findFoodCategoryRepairs(repairGrid, repairSections, '2026-10', 'Food / Groceries');
assert.equal(repairs.length, 1);
assert.equal(repairs[0].range, 'Transactions!D2');
assert.equal(repairs[0].values[0][0], 'Food / Groceries');
assert.equal(repairGrid[1][1], '10');
assert.equal(findFoodCategoryRepairs(repairGrid, repairSections, '2026-10', 'Food').length, 0);
console.log('New template checks passed: confirmed L8/D28:D38/J28:J33 targets, category-label aliases, blanks and zero, validation, formula preservation, category discovery, and in-place selected-month Food repair.');
