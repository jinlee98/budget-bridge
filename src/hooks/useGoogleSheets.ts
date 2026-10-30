import { useState, useEffect } from 'react';
import type { SummaryGrid, Transaction, TransactionSection } from '../types';
import { HEADERS, SHARED_EXPENSE_HEADERS, STORAGE } from '../config';
import { TRANSFER_CATEGORIES, categoryLabel } from '../lib/categories';
import { normalizeText, parseDate } from '../lib/format';
import { budgetRowKey } from '../lib/ledger';
import {
  SUMMARY_LAYOUT,
  discoverTransactionSections,
  extractSheetId,
  findFoodCategoryRepairs,
  findTemplatePlannedUpdates,
  summaryCategories,
  templateCategory,
} from '../lib/sheets';
import { authorizeGoogle as requestGoogleAuthorization, sheetsRequest } from '../services/google';
type Options = {
  reviewedMonthTransactions: Transaction[];
  month: string;
  monthLabel: string;
  startingBalance: string;
  plannedExpenses: Record<string, string>;
  plannedIncome: Record<string, string>;
};

export function useGoogleSheets({ reviewedMonthTransactions, month, monthLabel, startingBalance, plannedExpenses, plannedIncome }: Options) {
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  useEffect(() => {
    setSheetTabId(null);
    setSheetTitle('');
    setAccessToken('');
    setIsMonthlyBudgetTemplate(false);
    setTransactionSections([]);
    setSyncMessage('');
  }, [clientId, sheetUrl, tabName]);
  useEffect(() => {
    localStorage.setItem(STORAGE.sheetUrl, sheetUrl);
    localStorage.setItem(STORAGE.tabName, tabName);
  }, [clientId, sheetUrl, tabName]);
  async function connectSheet() {
    setIsConnecting(true);
    setSyncMessage('');
    try {
      const id = extractSheetId(sheetUrl);
      if (!id || id.includes(' ') || id.length < 10)
        throw new Error('Paste a Google Sheets URL or spreadsheet ID.');
      const token = await authorizeGoogle('consent');
      const metadata = await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '?fields=spreadsheetId,properties.title,sheets.properties', token) as {
        properties?: {
          title?: string;
        };
        sheets?: {
          properties: {
            sheetId: number;
            title: string;
          };
        }[];
      };
      const initialSheets = metadata.sheets ?? [];
      const summary = initialSheets.find((sheet) => sheet.properties.title === 'Summary');
      const templateTransactions = initialSheets.find((sheet) => sheet.properties.title === 'Transactions');
      const isTemplate = Boolean(summary && templateTransactions);
      const transactionGrid = isTemplate
        ? await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '/values/Transactions!A1:Z1000', token) as {
          values?: string[][];
        }
        : { values: [] as string[][] };
      const sections = isTemplate ? discoverTransactionSections(transactionGrid.values ?? []) : [];
      if (isTemplate && sections.length < 2) {
        throw new Error('I found the budget template, but could not identify both its Expenses and Income tables. No sheet rows were changed.');
      }
      const hasExampleRows = isTemplate && sections.some((section) => (transactionGrid.values ?? []).some((row) => {
        const date = parseDate(row[section.columns.date]);
        const description = normalizeText(String(row[section.columns.description] ?? ''));
        return date.startsWith('2000-') && (description === 'rent' || description === 'paycheck');
      }));
      const sheetRequests: {
        addSheet: {
          properties: {
            title: string;
          };
        };
      }[] = [];
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
      const refreshed = await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '?fields=properties.title,sheets.properties', token) as {
        properties?: {
          title?: string;
        };
        sheets?: {
          properties: {
            sheetId: number;
            title: string;
          };
        }[];
      };
      const sheets = refreshed.sheets ?? initialSheets;
      const ledgerTab = sheets.find((sheet) => sheet.properties.title === wantedLedger);
      const sharedTab = sheets.find((sheet) => sheet.properties.title === 'Shared Expenses');
      const transactionTab = sheets.find((sheet) => sheet.properties.title === 'Transactions');
      if (!ledgerTab)
        throw new Error('Could not create the ' + wantedLedger + ' tab.');
      const ledgerHeader = await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(wantedLedger + '!A1:N1'), token) as {
        values?: string[][];
      };
      if (!ledgerHeader.values?.length) {
        await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '/values/' + encodeURIComponent(wantedLedger + '!A1:N1') + '?valueInputOption=RAW', token, { method: 'PUT', body: JSON.stringify({ values: [HEADERS] }) });
      }
      if (isTemplate) {
        const sharedHeader = await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '/values/Shared%20Expenses!A1:J1', token) as {
          values?: string[][];
        };
        if (!sharedHeader.values?.length) {
          await sheetsRequest('spreadsheets/' + encodeURIComponent(id) + '/values/Shared%20Expenses!A1:J1?valueInputOption=RAW', token, { method: 'PUT', body: JSON.stringify({ values: [SHARED_EXPENSE_HEADERS] }) });
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
    }
    catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Could not connect to Google Sheets.');
    }
    finally {
      setIsConnecting(false);
    }
  }
  async function syncToSheet() {
    setIsSyncing(true);
    setSyncMessage('');
    try {
      if (sheetTabId === null)
        throw new Error('Connect the selected Google Sheet before uploading.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
        throw new Error('Choose a calendar month before uploading.');
      const token = accessToken || await authorizeGoogle();
      const spreadsheetId = extractSheetId(sheetUrl);
      if (!spreadsheetId)
        throw new Error('Connect a Google Sheet first.');
      const idRange = encodeURIComponent(ledgerTabName + '!N2:N');
      const existing = await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + idRange, token) as {
        values?: string[][];
      };
      const known = new Set((existing.values ?? []).flat().filter(Boolean));
      const additions = [...reviewedMonthTransactions]
        .filter((item) => !known.has(item.importKey))
        .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
      let budgetRowsAdded = 0;
      let sharedRowsAdded = 0;
      let categoryRowsFixed = 0;
      let setupCellsUpdated = 0;
      let budgetUpdates: {
        range: string;
        values: unknown[][];
      }[] = [];
      if (isMonthlyBudgetTemplate) {
        const summaryGrid = await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Summary!A:AZ?valueRenderOption=FORMULA', token) as {
          values?: SummaryGrid;
        };
        const summaryValues = summaryGrid.values ?? [];
        // Resolve all nonblank setup fields before making any upload writes.
        const setupUpdates = findTemplatePlannedUpdates(summaryValues, startingBalance, plannedExpenses, plannedIncome, [], SUMMARY_LAYOUT);
        const incomeCategories = summaryCategories(summaryValues, 'income', SUMMARY_LAYOUT);
        const expenseCategories = summaryCategories(summaryValues, 'expense', SUMMARY_LAYOUT);
        const foodCategory = templateCategory('Groceries', '', incomeCategories, undefined, expenseCategories);
        const transactionGrid = await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Transactions!A:Z', token) as {
          values?: string[][];
        };
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
          if (known.has(item.importKey))
            continue;
          if (TRANSFER_CATEGORIES.has(item.category))
            continue;
          byKind[item.category === 'Income' ? 'income' : 'expense'].push(item);
        }
        const pendingWrites: {
          section: TransactionSection;
          entries: {
            item: Transaction;
            amount: number;
            category: string;
          }[];
        }[] = [];
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
              if (existingBudgetKeys.has(key))
                return false;
              existingBudgetKeys.add(key);
              return true;
            })
            .sort((a, b) => a.item.date.localeCompare(b.item.date));
          if (entries.length)
            pendingWrites.push({ section, entries });
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
        const sharedKeyRange = await sheetsRequest('spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/Shared%20Expenses!J2:J', token) as {
          values?: string[][];
        };
        const sharedKeys = new Set((sharedKeyRange.values ?? []).flat().filter(Boolean));
        const sharedAdds = reviewedMonthTransactions.filter((item) => item.shared && item.amount < 0 && item.category !== 'Income' && !TRANSFER_CATEGORIES.has(item.category) && !sharedKeys.has(item.importKey));
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
      if (additions.length)
        parts.push(additions.length + ' row' + (additions.length === 1 ? '' : 's') + ' added to Imported Ledger');
      if (budgetRowsAdded)
        parts.push(budgetRowsAdded + ' budget transaction' + (budgetRowsAdded === 1 ? '' : 's') + ' added');
      if (sharedRowsAdded)
        parts.push(sharedRowsAdded + ' shared expense' + (sharedRowsAdded === 1 ? '' : 's') + ' added');
      if (categoryRowsFixed)
        parts.push(categoryRowsFixed + ' legacy grocery categories corrected');
      if (setupCellsUpdated)
        parts.push(setupCellsUpdated + ' budget setup cells updated');
      setSyncMessage(monthLabel + ': ' + (parts.join(' · ') || 'Everything is already in the sheet.'));
    }
    catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Upload failed. Reconnect and try again.');
    }
    finally {
      setIsSyncing(false);
    }
  }
  async function authorizeGoogle(prompt = '') {
    const token = await requestGoogleAuthorization(clientId, prompt);
    setAccessToken(token);
    return token;
  }
  return { sheetUrl, setSheetUrl, tabName, setTabName, sheetTitle, isMonthlyBudgetTemplate, isConnecting, isSyncing, syncMessage, setSyncMessage, connectSheet, syncToSheet };
}
