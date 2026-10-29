import type { BudgetBridge } from '../hooks/useBudgetBridge';
import { formatMoney } from '../lib/format';
type Props = Pick<
  BudgetBridge,
  | 'pending'
  | 'activeTab'
  | 'setActiveTab'
  | 'setSearch'
  | 'setCategoryFilter'
  | 'spending'
>;

export function SpendingBreakdown({
  pending,
  activeTab,
  setActiveTab,
  setSearch,
  setCategoryFilter,
  spending,
}: Props) {
  return (<>
    {activeTab === 'overview' && spending.length > 0 && <details className="panel spending-breakdown">
      <summary>What makes up this spending total?</summary>
      <p>For the selected month: expenses minus categorized refunds. Income, transfers, card payments, and investments are excluded using current local rules; manual choices take priority. Uncategorized outflows are included until reviewed. Shared charges count in full.</p>
      <p>Purchases on your card count as spending; paying its bill does not count again. Savings transfers, investment transfers, and card payments are bookkeeping entries kept in Imported Ledger, outside the budget’s income and expense tables. Interest earned is income.</p>
      <div className="spending-breakdown-grid">{spending.map((group) => <div key={group.currency}>
        <h3>{group.currency}</h3>
        <dl>
          <div><dt>Income</dt><dd>{formatMoney(group.income, group.currency)}</dd></div>
          <div><dt>Expense charges</dt><dd>{formatMoney(group.charges, group.currency)}</dd></div>
          <div><dt>Refunds / expense credits</dt><dd>−{formatMoney(group.refunds, group.currency)}</dd></div>
          <div className="spending-net"><dt>Net spending</dt><dd>{formatMoney(group.net, group.currency)}</dd></div>
          <div className="spending-net"><dt>Remaining (income − net spending)</dt><dd>{formatMoney(group.remaining, group.currency)}</dd></div>
          {group.categories.map((entry) => <div key={entry.category}><dt>{entry.category}</dt><dd>{formatMoney(entry.amount, group.currency)}</dd></div>)}
          <div><dt>Uncategorized charges included</dt><dd>{formatMoney(group.pending, group.currency)}</dd></div>
          <div><dt>Uncategorized deposits excluded</dt><dd>{formatMoney(group.unknownCredits, group.currency)}</dd></div>
        </dl>
        <p>{group.excluded} income / transfer / investment rows excluded.</p>
        <h3>Largest charges counted</h3>
        <dl>{group.largestCharges.map((charge, index) => <div key={charge.id + ':' + index}>
          <dt><button className="spending-charge-link" title={charge.category} onClick={() => { setActiveTab('transactions'); setCategoryFilter('All categories'); setSearch(charge.description); }}>{charge.description}</button></dt>
          <dd>{formatMoney(charge.amount, group.currency)}</dd>
        </div>)}</dl>
      </div>)}</div>
      <p>Use Refresh suggestions in Transactions to apply the current rules to saved category labels. Older imports with an incorrect account type or sign still need review; this calculation keeps their original amounts.</p>
      <button className="button button-outline" onClick={() => { setActiveTab('transactions'); setCategoryFilter('All categories'); setSearch(''); }}>Review this month’s transactions</button>
    </details>}
  </>);
}
