import type { BudgetBridge } from '../hooks/useBudgetBridge';
import { DEFAULT_EXPENSE_PLANS, DEFAULT_INCOME_PLANS, GOOGLE_MONTHLY_BUDGET_TEMPLATE } from '../config';
import { sheetCategory } from '../lib/categories';
type Props = Pick<
  BudgetBridge,
  | 'activeTab'
  | 'month'
  | 'startingBalance'
  | 'setStartingBalance'
  | 'plannedExpenses'
  | 'setPlannedExpenses'
  | 'plannedIncome'
  | 'setPlannedIncome'
  | 'reviewedMonthTransactions'
  | 'monthLabel'
  | 'sheetUrl'
  | 'setSheetUrl'
  | 'tabName'
  | 'setTabName'
  | 'sheetTitle'
  | 'isMonthlyBudgetTemplate'
  | 'isConnecting'
  | 'isSyncing'
  | 'syncMessage'
  | 'connectSheet'
  | 'syncToSheet'
>;

export function ConnectionsPanel({
  activeTab,
  month,
  startingBalance,
  setStartingBalance,
  plannedExpenses,
  setPlannedExpenses,
  plannedIncome,
  setPlannedIncome,
  reviewedMonthTransactions,
  monthLabel,
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
}: Props) {
  return (<>
    <section className={`panel connection-panel ${activeTab === 'transactions' ? 'view-hidden' : ''}`} id="connections">
      <div className="panel-heading">
        <div><div className="section-kicker">STEP 03 · YOUR DESTINATION</div><h2>Connect Google Sheets</h2></div>
        <div className={sheetTitle ? 'connection-indicator connected' : 'connection-indicator'}><span></span>{sheetTitle ? 'CONNECTED' : 'OPTIONAL'}</div>
      </div>
      <p className="helper-copy">This connects to your Monthly Budget copy. The full charge updates the budget; shared charges also appear in the split tracker.</p>
      <label className="form-field">
        <span>GOOGLE SHEET LINK OR ID</span>
        <input value={sheetUrl} onChange={(event) => setSheetUrl(event.target.value)} placeholder="Paste the link to your budget sheet" />
      </label>
      <div className="form-row">
        {!isMonthlyBudgetTemplate && <label className="form-field">
          <span>LEDGER TAB FOR A CUSTOM SHEET</span>
          <input value={tabName} onChange={(event) => setTabName(event.target.value)} />
        </label>}
        <button className="button button-outline connect-button" onClick={() => void connectSheet()} disabled={isConnecting}>
          {isConnecting ? 'Connecting…' : sheetTitle ? 'Reconnect' : 'Connect sheet'} <span>→</span>
        </button>
      </div>
      {syncMessage && <div className={syncMessage.includes('failed') || syncMessage.includes('Could not') || syncMessage.includes('Add your') || syncMessage.includes('origin') || syncMessage.includes('invalid_client') || syncMessage.includes('authorization') || syncMessage.includes('rejected') ? 'sync-message error' : 'sync-message'}>{syncMessage}</div>}
      <div className="connection-divider"></div>
      <div className="template-row">
        <div className="template-icon">▦</div>
        <div><strong>Need a budget sheet?</strong><span>Make a copy of your Monthly Budget template.</span></div>
        <a className="download-template" href={GOOGLE_MONTHLY_BUDGET_TEMPLATE} target="_blank" rel="noreferrer">Make a copy <span>↗</span></a>
      </div>
      <details className="budget-setup">
        <summary><span>Optional · starting balance and monthly plan</span><b>Set values <i>＋</i></b></summary>
        <div className="setup-body">
          <label className="form-field starting-balance-field">
            <span>STARTING BALANCE</span>
            <input type="number" min="0" step="0.01" value={startingBalance} onChange={(event) => setStartingBalance(event.target.value)} placeholder="Leave blank to keep the sheet value" />
          </label>
          <div className="plan-input-groups">
            <div className="plan-input-group">
              <div className="plan-group-title">Planned expenses <span>CAD</span></div>
              {DEFAULT_EXPENSE_PLANS.map((category) => (<label className="plan-input-row" key={category}>
                <span>{sheetCategory(category)}</span>
                <input aria-label={'Planned ' + sheetCategory(category)} type="number" min="0" step="0.01" value={plannedExpenses[category] ?? ''} placeholder="—" onChange={(event) => setPlannedExpenses((current) => ({ ...current, [category]: event.target.value }))} />
              </label>))}
            </div>
            <div className="plan-input-group">
              <div className="plan-group-title">Planned income <span>CAD</span></div>
              {DEFAULT_INCOME_PLANS.map((category) => (<label className="plan-input-row" key={category}>
                <span>{category}</span>
                <input aria-label={'Planned ' + category} type="number" min="0" step="0.01" value={plannedIncome[category] ?? ''} placeholder="—" onChange={(event) => setPlannedIncome((current) => ({ ...current, [category]: event.target.value }))} />
              </label>))}
            </div>
          </div>
          <p>Leave a field blank to preserve its current value. The starting balance goes to Summary; planned amounts go into the matching category rows.</p>
        </div>
      </details>
      {isMonthlyBudgetTemplate && <div className="template-destination-note"><span>✓</span> Full transactions → Transactions + Imported Ledger · Shared splits → Shared Expenses</div>}
      <div className="sync-footer">
        <span>Only {monthLabel} will upload ({reviewedMonthTransactions.length} local rows, including bookkeeping). Connect the matching month’s budget copy. Other imported dates stay on this device.</span>
        <button className="button button-green sync-button" disabled={!sheetTitle || isSyncing || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)} onClick={() => void syncToSheet()}>
          {isSyncing ? 'Syncing…' : 'Upload ' + monthLabel} <span>↑</span>
        </button>
      </div>
    </section>
  </>);
}
