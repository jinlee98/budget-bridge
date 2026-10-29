# Budget Bridge

A laptop-first React + TypeScript app for importing bank exports, reviewing transactions, and uploading a monthly budget to Google Sheets. Parsing and category suggestions run locally. No bank passwords, bank sign-ins, or AI services are involved.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

- `npm test` runs import, categorization, reconciliation, and template-mapping checks.
- `npm run build` checks TypeScript and creates the production build in `dist/`.

## Import and review

1. Export transactions directly from TD, Scotiabank, Tangerine, or Amex.
2. Choose CSV, QFX, QBO, or OFX files. Review the detected bank and account type, then import one file or select **Import all rows**.
3. Choose a calendar month and review its transactions, categories, and shared expenses.
4. Connect that month's budget copy and select **Upload [month]**.

CSV files need recognizable date, description, and amount columns. QFX/QBO/OFX files need standard transaction blocks. Bank and account detection uses file metadata and headers before filename hints; generic exports may require manual selection. The app currently assumes one bank account and one credit card per institution.

Weekly imports can overlap: existing transactions and duplicates within a batch are skipped. Bank transaction IDs provide the strongest match; otherwise matching uses account identity, dates, description, amount, and currency. Changed descriptions can still need review.

The month picker controls the overview, transaction list, category refresh, and uploads. Other imported dates remain saved locally. Changing months does **not** switch the connected spreadsheet; use the matching budget copy for each month.

## Categories and totals

- **Expenses:** Food / Groceries, Gifts, Health/medical, Home, Transportation, Personal, Pets, Utilities, Travel, Debt, Other.
- **Income:** Paycheck, Bonus, Interest, Other, Refunds.
- **Bookkeeping:** Card payments, Savings transfers, Investments, Transfers & Payments.

Local rules recognize merchants and descriptions such as payroll, loans, hotels, and investment contributions. Manual corrections take priority. **Refresh suggestions** updates automatic categories for the selected month while keeping reviewed choices. Generic descriptions such as "withdrawal" do not teach blanket merchant rules.

The transaction filter supports whole category groups, individual categories, and an **Uncategorized** shortcut. Click the Date header to switch newest-first or oldest-first. **Category status** explains whether a category was suggested, reviewed, or needs attention.

Overview keeps currencies separate:

- **Income** excludes refunds and bookkeeping transfers.
- **Net spending** is expense charges minus refunds.
- **Remaining this month** is income minus net spending, without starting balances. It is not your bank balance.

Uncategorized outflows remain included in spending; unknown deposits are excluded from income. Totals are provisional until those entries are reviewed. Expand the spending breakdown to inspect categories, credits, and the largest counted charges.

### Signs and transfers

In the ledger, money out is negative and money in is positive. Bank-account CSV amounts retain their signs. Amount-only credit-card CSVs assume positive purchases and negative credits, then flip them. Debit/credit columns and OFX-family amounts already define direction and are preserved. Check signs before uploading.

Positive card credits default to Refunds unless identified as payments/transfers or explicitly categorized otherwise. Refunds reduce spending, even though their dropdown group is Income. Negative refund reversals increase spending.

Card purchases count when charged. Paying the card bill, moving savings, or contributing to investments is bookkeeping and does not count again as spending. Loan repayments and financing fees remain expenses; earned interest and dividends are income.

The app can match generic bank debits to explicit card-payment credits across accounts when amounts are equal and opposite, currencies match, dates are within three days, and the match is unique. Equal amounts alone are insufficient; unidentified withdrawals still need review.

## Google Sheets

Make an editable copy of the [Budget Bridge template](https://docs.google.com/spreadsheets/d/1X4qtICR-4SztmMrQv2Xogf7bVV46QVzLxO7X8ie9yU4/copy). Uploads use:

- **Transactions:** the template's separate expense and income tables.
- **Imported Ledger:** all selected-month rows, including bookkeeping. Created automatically if missing.
- **Shared Expenses:** full charge, people in the split including you, each person's share, and the amount others owe.

Shared purchases keep their full charge in expenses. Income and bookkeeping entries are excluded from shared-expense tracking. Uploads check existing keys and budget rows to avoid duplicates. Local category edits generally do not rewrite previously uploaded rows; legacy Food labels are repaired to Food / Groceries for the selected month when required by the template.

Optional setup writes starting balance to **Summary!L8**, planned expenses within **D28:D38**, and planned income within **J28:J33**, matched by category label. Blank fields leave existing values unchanged; zero is an explicit update. Invalid amounts or missing categories stop the upload before transaction writes.

### OAuth setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project and enable the **Google Sheets API**.
2. Configure the OAuth consent screen. For personal testing, add your Google account as a test user.
3. Create an OAuth client of type **Web application**.
4. Add the exact **Authorized JavaScript origin**: usually `http://localhost:5173` locally, or `https://YOUR-USERNAME.github.io` for Pages. Include the port where applicable; omit repository paths.
5. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to the client ID ending in `.apps.googleusercontent.com`. Restart Vite or rebuild after changes.
6. Paste your budget copy's URL into Connections, select **Connect sheet**, and approve Google access.

This browser flow needs no client secret or redirect URI. The client ID is public and embedded in the build; never add service-account keys or secrets. Tokens stay in memory, so refreshing the page requires reconnecting. An `invalid_client` or "no registered origin" error usually means the configured origin does not match the current site.

## Storage and cleanup

Transactions, category rules, sheet settings, and budget setup use browser local storage, not cookies. They normally survive closing the page, but are specific to the browser profile and site address. Private browsing, clearing site data, or browser cleanup can remove them.

Use **Export ledger CSV** for an all-months backup. The red trash button clears local transactions and learned rules after confirmation; connection settings, budget setup, and Google Sheets stay unchanged. Never commit private exports or `.env.local`.

## GitHub Pages

1. In repository **Settings > Pages**, choose **GitHub Actions**.
2. Add an Actions repository variable named `VITE_GOOGLE_CLIENT_ID`.
3. Add the Pages origin to your OAuth client.
4. Run **Actions > Deploy Budget Bridge > Run workflow** on `main`.

Deployment is manual. Pages availability for private repositories depends on your GitHub plan. Browser data from localhost does not automatically transfer to the published site.

## Code layout

- `components/`: UI panels and controls.
- `hooks/`: local ledger state and Sheets workflow.
- `lib/`: imports, category rules, reconciliation, totals, and template mapping.
- `services/google.ts`: OAuth and Sheets HTTP requests.
- `config.ts` / `types.ts`: shared configuration and types.
- `tests/regression.cjs`: checks against the production helper modules.
