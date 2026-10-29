import { useState, useRef, useEffect, useMemo } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Papa from 'papaparse';
import type { ImportBatch, RawTransaction, Transaction } from '../types';
import { HEADERS, STORAGE } from '../config';
import {
  TRANSFER_CATEGORIES,
  categoryLabel,
  isGenericDescription,
  matchesCategoryFilter,
  merchantKey,
  migrateBookkeeping,
  parseCategorySelection,
  reconcileTransfers,
} from '../lib/categories';
import { hashString, normalizeText } from '../lib/format';
import { detectImportSource, parseCsvText, parseOfx, prepareImports } from '../lib/imports';
import { summarizeSpending, transactionsForMonth } from '../lib/ledger';
import { getStored } from '../lib/storage';
import { useGoogleSheets } from './useGoogleSheets';

export function useBudgetBridge() {
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
  const [startingBalance, setStartingBalance] = useState(() => localStorage.getItem(STORAGE.startingBalance) ?? '');
  const [plannedExpenses, setPlannedExpenses] = useState<Record<string, string>>(() => getStored(STORAGE.expensePlan, {}));
  const [plannedIncome, setPlannedIncome] = useState<Record<string, string>>(() => getStored(STORAGE.incomePlan, {}));
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => localStorage.setItem(STORAGE.transactions, JSON.stringify(transactions)), [transactions]);
  useEffect(() => localStorage.setItem(STORAGE.rules, JSON.stringify(rules)), [rules]);
  useEffect(() => {
    localStorage.setItem(STORAGE.startingBalance, startingBalance);
    localStorage.setItem(STORAGE.expensePlan, JSON.stringify(plannedExpenses));
    localStorage.setItem(STORAGE.incomePlan, JSON.stringify(plannedIncome));
  }, [startingBalance, plannedExpenses, plannedIncome]);
  const monthTransactions = useMemo(() => transactionsForMonth(transactions, month), [transactions, month]);
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
  const { sheetUrl, setSheetUrl, tabName, setTabName, sheetTitle, isMonthlyBudgetTemplate, isConnecting, isSyncing, syncMessage, setSyncMessage, connectSheet, syncToSheet } = useGoogleSheets({ reviewedMonthTransactions, month, monthLabel, startingBalance, plannedExpenses, plannedIncome });

  async function handleFiles(files: FileList | File[]) {
    const newBatches: ImportBatch[] = [];
    const problems: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const isOfx = /\.(qfx|qbo|ofx)$/i.test(file.name) || /<OFX>|<OFXHEADER|<STMTTRN>/i.test(text.slice(0, 800));
        const source = detectImportSource(text, file.name, isOfx);
        let parsed: {
          rows: RawTransaction[];
          skipped: number;
        };
        let currency = 'CAD';
        if (isOfx) {
          const result = parseOfx(text);
          parsed = result;
          currency = result.currency || currency;
        }
        else {
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
      }
      catch {
        problems.push(file.name + ': could not read this file');
      }
    }
    setPending((current) => [...current, ...newBatches]);
    if (newBatches.length)
      setNotice(newBatches.length + ' file' + (newBatches.length === 1 ? '' : 's') + ' ready to review.');
    if (problems.length)
      setNotice(problems.join(' · '));
  }
  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length)
      void handleFiles(event.target.files);
    event.target.value = '';
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length)
      void handleFiles(event.dataTransfer.files);
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
    if (isGenericDescription(transaction.description))
      return;
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
  function clearAll() {
    if (!window.confirm('Clear imported transactions and learned category rules for ALL months from this browser? Export a ledger CSV first if you need a backup. Your Google Sheet, connection settings, and budget setup values will stay unchanged.'))
      return;
    setTransactions([]);
    setRules({});
    setNotice('Local transaction data cleared.');
    setSyncMessage('');
  }

  return {
    transactions,
    setTransactions,
    rules,
    pending,
    activeTab,
    setActiveTab,
    month,
    setMonth,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    dateSort,
    setDateSort,
    isDragging,
    setIsDragging,
    notice,
    setNotice,
    startingBalance,
    setStartingBalance,
    plannedExpenses,
    setPlannedExpenses,
    plannedIncome,
    setPlannedIncome,
    fileInput,
    monthTransactions,
    reviewedTransactions,
    reviewedMonthTransactions,
    monthLabel,
    spending,
    uncategorized,
    filteredTransactions,
    onFileInput,
    onDrop,
    updateBatch,
    importBatches,
    removeBatch,
    updateCategory,
    updateShared,
    updateSplitCount,
    downloadCsv,
    clearAll,
    sheetUrl,
    setSheetUrl,
    tabName,
    setTabName,
    sheetTitle,
    isMonthlyBudgetTemplate,
    isConnecting,
    isSyncing,
    syncMessage,
    connectSheet,
    syncToSheet,
  };
}

export type BudgetBridge = ReturnType<typeof useBudgetBridge>;
