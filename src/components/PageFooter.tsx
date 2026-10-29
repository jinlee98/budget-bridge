import type { BudgetBridge } from '../hooks/useBudgetBridge';
type Props = Pick<
  BudgetBridge,
  | 'downloadCsv'
  | 'clearAll'
>;

export function PageFooter({
  downloadCsv,
  clearAll,
}: Props) {
  return (<>
    <footer className="page-footer">
      <span>Budget Bridge <i>·</i> bank exports to your budget</span>
      <div><button onClick={downloadCsv}>Export ledger CSV</button><button onClick={clearAll}>Clear ledger &amp; rules</button></div>
    </footer>
  </>);
}
