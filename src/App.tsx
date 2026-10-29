import { ConnectionsPanel } from './components/ConnectionsPanel';
import { ImportPanel } from './components/ImportPanel';
import { ImportReview } from './components/ImportReview';
import { OverviewStats } from './components/OverviewStats';
import { PageFooter } from './components/PageFooter';
import { PageHeading } from './components/PageHeading';
import { Sidebar } from './components/Sidebar';
import { SpendingBreakdown } from './components/SpendingBreakdown';
import { StorageHelp } from './components/StorageHelp';
import { TransactionsPanel } from './components/TransactionsPanel';
import { useBudgetBridge } from './hooks/useBudgetBridge';

export default function App() {
  const budget = useBudgetBridge();
  const { transactions, activeTab, notice, setNotice, sheetTitle } = budget;
  return (<div className="app-shell">
    <Sidebar {...budget} />

    <main className="main-content">
      <header className="topbar">
        <div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><strong>{activeTab === 'overview' ? 'Overview' : activeTab === 'transactions' ? 'Transactions' : 'Connections'}</strong></div>
        <div className="top-actions">
          <span className="local-chip"><span></span> LOCAL DATA</span>
        </div>
      </header>

      <div className="page-wrap">
        <PageHeading {...budget} />

        <section className={activeTab === 'overview' ? 'step-strip' : 'step-strip view-hidden'}>
          <div className="step active"><span className="step-number">01</span><div><strong>Import</strong><small>CSV, QFX, QBO or OFX</small></div></div>
          <div className="step-connector"></div>
          <div className={transactions.length ? 'step active' : 'step'}><span className="step-number">02</span><div><strong>Review</strong><small>Categories & duplicates</small></div></div>
          <div className="step-connector"></div>
          <div className={sheetTitle ? 'step active' : 'step'}><span className="step-number">03</span><div><strong>Sync</strong><small>Your Google Sheet</small></div></div>
          <div className="step-note"><span className="tiny-lock">◇</span> No bank passwords required</div>
        </section>

        <OverviewStats {...budget} />

        <SpendingBreakdown {...budget} />

        {notice && <div className="notice-banner"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

        <ImportReview {...budget} />

        <div className={`content-grid ${activeTab === 'transactions' ? 'view-hidden' : ''} ${activeTab === 'connections' ? 'connections-mode' : ''}`}>
          <ImportPanel {...budget} />

          <ConnectionsPanel {...budget} />
        </div>

        <TransactionsPanel {...budget} />

        <StorageHelp />
        <PageFooter {...budget} />
      </div>
    </main>
  </div>);
}
