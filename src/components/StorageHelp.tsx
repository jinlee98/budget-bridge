export function StorageHelp() {
  return (<>
    <details className="storage-help">
      <summary>Storage &amp; cleanup</summary>
      <p>Your ledger, category corrections, sheet link, and budget setup are saved in this browser’s local storage, not cookies. They normally stay when you close the page and return later on the same browser profile and site address. Google access tokens stay in memory and expire separately.</p>
      <p>Private browsing, clearing site data, or browser storage cleanup can remove local data. Another browser, device, or site address has separate storage. Export the ledger CSV below for a portable backup; Sheets uploads are separate saved copies.</p>
      <p>Clear ledger &amp; rules removes local transactions and learned rules for all months. It keeps your connection settings and budget setup, and does not delete anything in Google Sheets.</p>
    </details>
  </>);
}
