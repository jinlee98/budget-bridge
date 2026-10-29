import type { BudgetBridge } from '../hooks/useBudgetBridge';
type Props = Pick<
  BudgetBridge,
  | 'activeTab'
  | 'month'
  | 'setMonth'
  | 'isConnecting'
  | 'isSyncing'
>;

export function PageHeading({
  activeTab,
  month,
  setMonth,
  isConnecting,
  isSyncing,
}: Props) {
  return (<>
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-line"></span> YOUR MONEY, IN ONE PLACE</div>
        <h1>{activeTab === 'overview' ? 'Bring your budget together.' : activeTab === 'transactions' ? 'Every transaction, in order.' : 'Connect your budget sheet.'}</h1>
        <p className="subtitle">{activeTab === 'overview' ? 'Import bank exports, review categories, and sync to your Monthly Budget sheet.' : activeTab === 'transactions' ? 'Review, categorize, and split transactions imported on this device.' : 'Set up Google Sheets access and manage where your reviewed transactions are uploaded.'}</p>
      </div>
      <div className="month-control">
        <label htmlFor="month-picker">VIEWING PERIOD</label>
        <input id="month-picker" type="month" value={month} disabled={isSyncing || isConnecting} onChange={(event) => setMonth(event.target.value)} />
      </div>
    </section>
  </>);
}
