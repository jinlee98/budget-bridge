import type { BudgetBridge } from '../hooks/useBudgetBridge';
import { Icon } from './Icon';
type Props = Pick<
  BudgetBridge,
  | 'transactions'
  | 'activeTab'
  | 'setActiveTab'
  | 'clearAll'
>;

export function Sidebar({
  transactions,
  activeTab,
  setActiveTab,
  clearAll,
}: Props) {
  return (<>
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span></span><span></span><span></span></div>
        <div>
          <div className="brand-name">budget bridge</div>
          <div className="brand-caption">BANK EXPORTS → BUDGET</div>
        </div>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={activeTab === 'overview' ? 'nav-item active' : 'nav-item'} title="Overview" aria-label="Overview" onClick={() => setActiveTab('overview')}>
          <Icon>◫</Icon><span>Overview</span><span className="nav-dot"></span>
        </button>
        <button className={activeTab === 'transactions' ? 'nav-item active' : 'nav-item'} title="Transactions" aria-label="Transactions" onClick={() => setActiveTab('transactions')}>
          <Icon>▤</Icon><span>Transactions</span><span className="nav-count">{transactions.length || ''}</span>
        </button>
        <button className={activeTab === 'connections' ? 'nav-item active' : 'nav-item'} title="Connections" aria-label="Connections" onClick={() => setActiveTab('connections')}>
          <Icon>⛓</Icon><span>Connections</span>
        </button>
      </nav>
      <div className="sidebar-spacer"></div>
      <div className="privacy-card">
        <div className="privacy-icon">⌁</div>
        <div className="privacy-title">Your files stay local</div>
        <p>Imports are read in this browser. Nothing is sent anywhere until you choose to sync.</p>
        <div className="privacy-status"><span></span> LOCAL-FIRST MODE</div>
      </div>
      <div className="sidebar-bottom">
        <div className="avatar">JL</div>
        <div className="profile-copy"><strong>My budget</strong><span>Personal workspace</span></div>
        <button className="clear-data-button" aria-label="Clear local ledger and learned rules for all months" title="Clear local ledger & rules" onClick={clearAll}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
          </svg>
        </button>
      </div>
    </aside>
  </>);
}
