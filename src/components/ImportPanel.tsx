import type { BudgetBridge } from '../hooks/useBudgetBridge';
type Props = Pick<
  BudgetBridge,
  | 'activeTab'
  | 'isDragging'
  | 'setIsDragging'
  | 'setNotice'
  | 'fileInput'
  | 'onFileInput'
  | 'onDrop'
>;

export function ImportPanel({
  activeTab,
  isDragging,
  setIsDragging,
  setNotice,
  fileInput,
  onFileInput,
  onDrop,
}: Props) {
  return (<>
    <section className={`panel import-panel ${activeTab === 'connections' ? 'view-hidden' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
      <div className="panel-heading">
        <div><div className="section-kicker">STEP 01 · ADD BANK EXPORTS</div><h2>Bring everything together</h2></div>
        <button className="icon-button" aria-label="Import help" onClick={() => setNotice('Export transaction files from each bank’s website, then select several files together. Your bank login stays with the bank.')}>?</button>
      </div>
      <div className={isDragging ? 'drop-zone drag-active' : 'drop-zone'}>
        <input ref={fileInput} type="file" multiple accept=".csv,.qfx,.qbo,.ofx,text/csv,application/x-ofx" onChange={onFileInput} />
        <div className="upload-illustration"><div className="upload-cloud">↑</div><span className="orbit orbit-one"></span><span className="orbit orbit-two"></span></div>
        <h3>Drop bank files here</h3>
        <p>or choose multiple exports from your computer</p>
        <button className="button button-outline" onClick={() => fileInput.current?.click()}>Choose files <span>↗</span></button>
        <div className="format-list"><span>CSV</span><i></i><span>QFX</span><i></i><span>QBO</span><i></i><span>OFX</span></div>
      </div>
      <div className="bank-hints">
        <div className="bank-hints-head"><span>GET YOUR EXPORTS</span><span>OPEN BANK SITE ↗</span></div>
        <div className="bank-links">
          <a href="https://easyweb.td.com/" target="_blank" rel="noreferrer"><span className="bank-monogram td">TD</span>TD EasyWeb <b>↗</b></a>
          <a href="https://www.scotiabank.com/ca/en/personal.html" target="_blank" rel="noreferrer"><span className="bank-monogram scotia">S</span>Scotiabank <b>↗</b></a>
          <a href="https://www.tangerine.ca/app/index.html" target="_blank" rel="noreferrer"><span className="bank-monogram tan">T</span>Tangerine <b>↗</b></a>
          <a href="https://www.americanexpress.com/en-ca/account/login" target="_blank" rel="noreferrer"><span className="bank-monogram amex">A</span>Amex Online <b>↗</b></a>
        </div>
        <p className="bank-hint-note">Sign in at your bank, download activity, then return here. This app never asks for bank credentials.</p>
      </div>
    </section>
  </>);
}
