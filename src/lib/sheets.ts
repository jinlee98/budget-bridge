import type {
  IncomeCategory,
  SheetMerge,
  SummaryGrid,
  SummaryLayout,
  TransactionSection,
} from '../types';
import { TRANSFER_CATEGORIES, inferIncomeCategory, sheetCategory } from './categories';
import { normalizeText, parseDate, parseMoney } from './format';

export function extractSheetId(urlOrId: string): string {
  const text = urlOrId.trim();
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? text;
}

export function templateCategory(category: string, description: string, incomeCategories: string[], incomeCategory?: IncomeCategory, expenseCategories: string[] = []): string {
  if (category === 'Income') {
    if (incomeCategory === 'Refunds' || (!incomeCategory && inferIncomeCategory(description) === 'Refunds'))
      return incomeCategories.includes('Refunds') ? 'Refunds' : 'Other';
    if (incomeCategory)
      return incomeCategory;
    const inferred = inferIncomeCategory(description);
    if (incomeCategories.includes(inferred))
      return inferred;
    return incomeCategories.includes('Other') ? 'Other' : (incomeCategories[0] ?? 'Other');
  }
  const desired = category === 'Uncategorized' ? 'Other' : sheetCategory(category);
  const match = expenseCategories.find((label) => normalizeText(label) === normalizeText(desired));
  if (match) return match;
  if (expenseCategories.length) throw new Error('Expense category "' + desired + '" is missing from Summary. Update your budget copy to match the app categories before uploading.');
  return desired;
}

export function discoverTransactionSections(grid: string[][]): TransactionSection[] {
  for (let rowIndex = 0; rowIndex < Math.min(grid.length, 20); rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    const normalized = row.map((value) => normalizeText(String(value ?? '')));
    const labels = {
      date: normalized.map((value, index) => value === 'date' ? index : -1).filter((index) => index >= 0),
      amount: normalized.map((value, index) => value === 'amount' ? index : -1).filter((index) => index >= 0),
      description: normalized.map((value, index) => ['description', 'details', 'transaction'].includes(value) ? index : -1).filter((index) => index >= 0),
      category: normalized.map((value, index) => value === 'category' ? index : -1).filter((index) => index >= 0),
    };
    if (!labels.date.length || !labels.amount.length || !labels.description.length || !labels.category.length)
      continue;
    const all = [
      ...labels.date.map((col) => ({ field: 'date' as const, col })),
      ...labels.amount.map((col) => ({ field: 'amount' as const, col })),
      ...labels.description.map((col) => ({ field: 'description' as const, col })),
      ...labels.category.map((col) => ({ field: 'category' as const, col })),
    ].sort((a, b) => a.col - b.col);
    const clusters: typeof all[] = [];
    for (const item of all) {
      const cluster = clusters[clusters.length - 1];
      if (!cluster || item.col - cluster[cluster.length - 1].col > 1)
        clusters.push([item]);
      else
        cluster.push(item);
    }
    const complete = clusters.map((cluster) => {
      const fields: Partial<TransactionSection['columns']> = {};
      for (const item of cluster) {
        if (fields[item.field] === undefined)
          fields[item.field] = item.col;
      }
      if (fields.date === undefined || fields.amount === undefined || fields.description === undefined || fields.category === undefined)
        return null;
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

export function findFoodCategoryRepairs(grid: string[][], sections: TransactionSection[], month: string, foodCategory: string) {
  const repairs: {
    range: string;
    values: unknown[][];
  }[] = [];
  for (const section of sections.filter((entry) => entry.kind === 'expense')) {
    for (let r = section.headerRow + 1; r < grid.length; r += 1) {
      const row = grid[r] ?? [];
      const category = String(row[section.columns.category] ?? '').trim();
      if (normalizeText(category) === 'food groceries' && foodCategory !== category && parseDate(row[section.columns.date]).slice(0, 7) === month) {
        repairs.push({ range: 'Transactions!' + columnName(section.columns.category) + (r + 1), values: [[foodCategory]] });
      }
    }
  }
  return repairs;
}

export const SUMMARY_LAYOUT: SummaryLayout = {
  startingBalanceCell: 'L8',
  expense: { firstRow: 28, lastRow: 41, labelCol: 1, plannedCol: 3 },
  income: { firstRow: 28, lastRow: 33, labelCol: 7, plannedCol: 9 },
};

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

export function discoverSummarySections(grid: SummaryGrid, layout?: SummaryLayout) {
  const sections: {
    kind: 'expense' | 'income';
    headerRow: number;
    labelCol: number;
    plannedCol: number;
    endRow: number;
  }[] = [];
  if (layout)
    return (['expense', 'income'] as const).map((kind) => ({
      kind, headerRow: layout[kind].firstRow - 2, endRow: layout[kind].lastRow,
      labelCol: layout[kind].labelCol, plannedCol: layout[kind].plannedCol,
    }));
  for (let t = 0; t < grid.length; t += 1) {
    const titles = (grid[t] ?? []).map((cell) => normalizeText(String(cell)));
    for (let c = 0; c < titles.length; c += 1) {
      if (titles[c] !== 'expenses' && titles[c] !== 'income')
        continue;
      const kind = titles[c] === 'expenses' ? 'expense' : 'income';
      const nextTitle = titles.findIndex((cell, index) => index > c && (cell === 'expenses' || cell === 'income'));
      for (let r = t + 1; r < Math.min(grid.length, t + 7); r += 1) {
        const plannedCol = (grid[r] ?? []).findIndex((cell, index) => index >= c && (nextTitle < 0 || index < nextTitle) && normalizeText(String(cell)) === 'planned');
        if (plannedCol < 0)
          continue;
        let endRow = grid.length;
        for (let below = r + 1; below < grid.length; below += 1) {
          const title = normalizeText(String(grid[below]?.[c] ?? ''));
          if (title === 'expenses' || title === 'income') {
            endRow = below;
            break;
          }
        }
        sections.push({ kind, headerRow: r, labelCol: c, plannedCol, endRow });
        break;
      }
    }
  }
  return sections;
}

export function summaryCategories(grid: SummaryGrid, kind: 'expense' | 'income', layout?: SummaryLayout): string[] {
  const result: string[] = [];
  for (const section of discoverSummarySections(grid, layout).filter((entry) => entry.kind === kind)) {
    for (let r = section.headerRow + 1; r < section.endRow; r += 1) {
      for (let c = section.labelCol; c < section.plannedCol; c += 1) {
        const value = String(grid[r]?.[c] ?? '').trim();
        if (value && !value.startsWith('=') && !parseMoney(value))
          result.push(value);
      }
    }
  }
  return [...new Set(result)];
}

export function findTemplatePlannedUpdates(grid: SummaryGrid, startingBalance: string, expensePlan: Record<string, string>, incomePlan: Record<string, string>, merges: SheetMerge[] = [], layout?: SummaryLayout): {
  range: string;
  values: unknown[][];
}[] {
  const updates: {
    range: string;
    values: unknown[][];
  }[] = [];
  const amount = (raw: string, label: string) => {
    const parsed = parseMoney(raw);
    if (!parsed)
      throw new Error('Invalid amount for ' + label + '. No setup values were written.');
    return parsed.amount;
  };
  if (startingBalance.trim() && layout) {
    updates.push({ range: 'Summary!' + layout.startingBalanceCell, values: [[amount(startingBalance, 'starting balance')]] });
  }
  else if (startingBalance.trim()) {
    let target: {
      r: number;
      c: number;
    } | undefined;
    for (let r = 0; r < grid.length && !target; r += 1) {
      for (let c = 0; c < (grid[r]?.length ?? 0); c += 1) {
        if (normalizeText(String(grid[r][c])) !== 'starting balance')
          continue;
        const labelMerge = merges.find((merge) => merge.startRowIndex === r && merge.startColumnIndex === c);
        const firstColumn = labelMerge?.endColumnIndex ?? c + 1;
        for (let next = firstColumn; next < firstColumn + 6; next += 1) {
          const cell = String(grid[r]?.[next] ?? '').trim();
          if (cell.startsWith('='))
            break;
          if (cell && parseMoney(cell)) {
            target = { r, c: next };
            break;
          }
          if (cell)
            break;
        }
        if (!target && labelMerge && !String(grid[r]?.[firstColumn] ?? '').trim())
          target = { r, c: firstColumn };
      }
    }
    if (!target)
      throw new Error('Could not identify the editable starting balance cell in Summary. No setup values were written.');
    updates.push({ range: 'Summary!' + columnName(target.c) + (target.r + 1), values: [[amount(startingBalance, 'starting balance')]] });
  }
  const sections = discoverSummarySections(grid, layout);
  for (const [kind, plans] of [['expense', expensePlan], ['income', incomePlan]] as const) {
    for (const [category, rawAmount] of Object.entries(plans)) {
      if (!rawAmount.trim() || (kind === 'income' && category === 'Savings') || (kind === 'expense' && TRANSFER_CATEGORIES.has(sheetCategory(category))))
        continue;
      let range = '';
      for (const section of sections.filter((entry) => entry.kind === kind)) {
        for (let r = section.headerRow + 1; r < section.endRow && !range; r += 1) {
          for (let c = section.labelCol; c < section.plannedCol; c += 1) {
            const label = String(grid[r]?.[c] ?? '');
            const matches = kind === 'expense' ? normalizeText(sheetCategory(label)) === normalizeText(sheetCategory(category)) : normalizeText(label) === normalizeText(category);
            if (matches) {
              range = 'Summary!' + columnName(section.plannedCol) + (r + 1);
              break;
            }
          }
        }
        if (range)
          break;
      }
      if (!range)
        throw new Error('Could not find the planned ' + kind + ' category "' + sheetCategory(category) + '" in Summary. No setup values were written.');
      updates.push({ range, values: [[amount(rawAmount, category)]] });
    }
  }
  return updates;
}
