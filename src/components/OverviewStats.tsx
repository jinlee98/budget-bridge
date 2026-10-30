import type { BudgetBridge } from '../hooks/useBudgetBridge';
import { formatMoney } from '../lib/format';
type Props = Pick<
  BudgetBridge,
  | 'transactions'
  | 'pending'
  | 'activeTab'
  | 'setActiveTab'
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
      <div className="stat-card">
        <div className="stat-top"><span>TRANSACTIONS IN LEDGER</span><span className="stat-icon">▤</span></div>
        <div className="stat-number">{transactions.length.toLocaleString('en-CA')}</div>
        <div className="stat-foot"><span className="stat-marker blue"></span> {monthTransactions.length} in {monthLabel}</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>NEEDS A CATEGORY</span><span className="stat-icon">⌑</span></div>
        <div className="stat-number">{uncategorized}</div>
        <div className="stat-foot"><span className={uncategorized ? 'stat-marker amber' : 'stat-marker green'}></span> {uncategorized ? 'Review before syncing' : 'You’re all caught up'}</div>
      </div>
      <div className="stat-card">
        <div className="stat-top"><span>SHEET CONNECTION</span><span className="stat-icon">↗</span></div>
        <div className="stat-number stat-sheet">{sheetTitle || 'Not connected'}</div>
        <div className="stat-foot"><span className={sheetTitle ? 'stat-marker green' : 'stat-marker muted'}></span> <button className="connection-shortcut" onClick={() => setActiveTab('connections')}>{sheetTitle ? 'Manage connection & upload' : 'Connect Google Sheets'}</button></div>
      </div>
    </section>
  </>);
}
