import type { BudgetBridge } from '../hooks/useBudgetBridge';
import {
  TRANSFER_CATEGORIES,
  budgetImpact,
  categoryGroup,
  categorySelection,
  reconcileTransfers,
  refreshSuggestions,
} from '../lib/categories';
import { formatDate, formatMoney } from '../lib/format';
import { CategoryOptions } from './CategoryOptions';
type Props = Pick<
  BudgetBridge,
  | 'transactions'
  | 'setTransactions'
  | 'rules'
  | 'activeTab'
  | 'month'
  | 'search'
  | 'setSearch'
  | 'categoryFilter'
  | 'setCategoryFilter'
  | 'dateSort'
  | 'setDateSort'
  | 'setNotice'
  | 'fileInput'
  | 'reviewedTransactions'
  | 'reviewedMonthTransactions'
  | 'monthLabel'
  | 'filteredTransactions'
  | 'updateCategory'
  | 'updateShared'
  | 'updateSplitCount'
  | 'downloadCsv'
>;

export function TransactionsPanel({
  transactions,
  setTransactions,
  rules,
  activeTab,
  month,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  dateSort,
  setDateSort,
  setNotice,
  fileInput,
  reviewedTransactions,
  reviewedMonthTransactions,
  monthLabel,
  filteredTransactions,
  updateCategory,
  updateShared,
  updateSplitCount,
  downloadCsv,
}: Props) {
  return (<>
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
          <select className={'filter-select category-tone-' + categoryGroup(categoryFilter) + (categoryFilter === 'All categories' ? ' all-categories-filter' : '')} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option>All categories</option><CategoryOptions filterMode />
          </select>
          <button className="icon-button export-button" title="Export combined CSV" onClick={downloadCsv}>↓</button>
        </div>
      </div>
      {transactions.length === 0 ? (<div className="empty-ledger">
        <div className="empty-icon">▤</div><strong>Your ledger is ready when you are.</strong>
        <span>Import your first transaction file to see everything sorted here.</span>
        <button className="text-button" onClick={() => fileInput.current?.click()}>Choose a file <span>→</span></button>
      </div>) : filteredTransactions.length === 0 ? (<div className="empty-ledger compact-empty"><strong>No transactions match those filters.</strong><span>Try another month or search.</span></div>) : (<div className="table-scroll">
        <table>
          <thead><tr><th aria-sort={dateSort === 'asc' ? 'ascending' : 'descending'}><button className="date-sort-button" onClick={() => setDateSort((current) => current === 'asc' ? 'desc' : 'asc')} title={dateSort === 'asc' ? 'Oldest first. Click for newest first.' : 'Newest first. Click for oldest first.'} aria-label={dateSort === 'asc' ? 'Date: oldest first. Sort newest first' : 'Date: newest first. Sort oldest first'}>DATE <span aria-hidden="true">{dateSort === 'asc' ? '↑' : '↓'}</span></button></th><th>DESCRIPTION</th><th>ACCOUNT</th><th>CATEGORY</th><th>AMOUNT</th><th>SHARED</th><th title="How the category was assigned">CATEGORY STATUS</th></tr></thead>
          <tbody>
            {filteredTransactions.map((transaction) => (<tr key={transaction.id}>
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
            </tr>))}
          </tbody>
        </table>
      </div>)}
    </section>
  </>);
}
