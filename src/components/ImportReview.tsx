import type { BudgetBridge } from '../hooks/useBudgetBridge';
import type { AccountKind, Institution } from '../types';
import { BANKS } from '../config';
type Props = Pick<
  BudgetBridge,
  | 'pending'
  | 'activeTab'
  | 'updateBatch'
  | 'importBatches'
  | 'removeBatch'
>;

export function ImportReview({
  pending,
  activeTab,
  updateBatch,
  importBatches,
  removeBatch,
}: Props) {
  return (<>
    {pending.length > 0 && activeTab === 'overview' && (<section className="panel pending-panel">
      <div className="panel-heading">
        <div><div className="section-kicker">READY TO IMPORT</div><h2>Review your files</h2></div>
      </div>
      <p className="helper-copy">Confirm the source and account type. Imports keep every recognized date and skip duplicates, so overlapping weekly exports are safe. Review and upload use only the calendar month selected above.</p>
      <div className="pending-list">
        {pending.map((batch) => (<div className="pending-file" key={batch.id}>
          <div className="file-badge">{batch.format === 'CSV' ? 'CSV' : 'OFX'}</div>
          <div className="file-details">
            <strong>{batch.fileName}</strong>
            <span>{batch.rows.length.toLocaleString('en-CA')} rows recognized · {batch.skipped} skipped</span>
            <small className="field-hint">{batch.detectionNote}</small>
          </div>
          <label className="compact-field"><span>BANK</span>
            <select value={batch.institution} onChange={(event) => {
              const institution = event.target.value as Institution;
              updateBatch(batch.id, { institution });
            }}>
              {BANKS.map((bank) => <option key={bank}>{bank}</option>)}
            </select>
          </label>
          <label className="compact-field"><span>ACCOUNT TYPE</span>
            <select value={batch.accountKind} onChange={(event) => {
              const accountKind = event.target.value as AccountKind;
              updateBatch(batch.id, { accountKind });
            }}>
              <option value="bank">Bank account</option><option value="card">Credit card</option>
            </select>
          </label>
          <div className="file-row-actions">
            <button className="text-button" onClick={() => removeBatch(batch.id)}>Remove</button>
            <button className="button button-green button-small" onClick={() => importBatches([batch])}>Import {batch.rows.length} rows <span>→</span></button>
          </div>
        </div>))}
      </div>
      <div className="pending-actions">
        <button className="button button-green import-all-button" onClick={() => importBatches(pending)}>Import all rows ({pending.reduce((sum, batch) => sum + batch.rows.length, 0)})</button>
      </div>
    </section>)}
  </>);
}
