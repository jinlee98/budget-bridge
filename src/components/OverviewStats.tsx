import type { BudgetBridge } from '../hooks/useBudgetBridge';
import { formatMoney } from '../lib/format';
type Props = Pick<
  BudgetBridge,
  | 'transactions'
  | 'pending'
  | 'activeTab'
  | 'setActiveTab'
  | 'setCategoryFilter'
  | 'setSearch'
  | 'monthTransactions'
  | 'monthLabel'
  | 'spending'
  | 'uncategorized'
  | 'sheetTitle'
>;

export function OverviewStats({
  transactions,
  pending,
  activeTab,
  setActiveTab,
  setCategoryFilter,
  setSearch,
  monthTransactions,
  monthLabel,
  spending,
  uncategorized,
  sheetTitle,
}: Props) {
  return (<>
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
      <div className="overview-statusbar">
        <button className="overview-status-item" title={transactions.length + ' saved across all months'} onClick={() => { setActiveTab('transactions'); setCategoryFilter('All categories'); setSearch(''); }}>
          <strong>{monthTransactions.length}</strong><span>transactions in {monthLabel}</span>
        </button>
        <button className="overview-status-item" onClick={() => { setActiveTab('transactions'); setCategoryFilter('Uncategorized'); setSearch(''); }}>
          <span className={uncategorized ? 'stat-marker amber' : 'stat-marker green'}></span><strong>{uncategorized}</strong><span>{uncategorized ? 'need a category' : 'uncategorized'}</span>
        </button>
        <button className="overview-status-item" title={sheetTitle || 'Connect your monthly budget copy'} onClick={() => setActiveTab('connections')}>
          <span className={sheetTitle ? 'stat-marker green' : 'stat-marker muted'}></span><span>{sheetTitle ? 'Sheet connected - manage & upload' : 'Connect Google Sheets'}</span>
        </button>
      </div>
    </section>
  </>);
}
