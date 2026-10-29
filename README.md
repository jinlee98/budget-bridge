# Budget Bridge

A laptop-first, local-first personal transaction importer built with React and TypeScript. It imports bank exports, normalizes them into one chronological ledger, suggests categories with local merchant rules, detects duplicate imports, and syncs to the Google Sheets Monthly Budget copy linked in the app.

## Run locally

Requires Node.js 20 or newer.

    npm install
    npm run dev

Run `npm test` for synthetic import and template-mapping regression checks, and `npm run build` for TypeScript validation and the production build.

## Project layout

```text
src/
  App.tsx             Page layout and component composition
  components/         Navigation, overview, import, transactions, and connection panels
  hooks/
    useBudgetBridge.ts  Local ledger state, persistence, filters, and user actions
    useGoogleSheets.ts  Connection state and monthly Sheets upload workflow
  lib/
    accounts.ts       Bank and account-type hints
    imports.ts        CSV/OFX parsing, source detection, and batch imports
    categories.ts     Local rules, category migration, and transfer matching
    ledger.ts         Duplicate keys, month filtering, and overview totals
    sheets.ts         Template categories, cell mapping, and upload repairs
    format.ts         Shared date, amount, and text helpers
    storage.ts        Reading saved browser data
  services/google.ts  Google OAuth and authenticated Sheets HTTP requests
  config.ts           Storage keys, template URL, and shared configuration
  types.ts            Shared transaction and template types
tests/regression.cjs   Regression checks importing the production helper modules
```

The refactor retains the existing browser storage keys, so saved ledgers and category rules remain compatible. OAuth tokens remain in memory, and transaction parsing and categorization remain local.

Changing the Google client ID or destination requires reconnecting before uploading. All matching transactions are available for review in the Transactions view. Debit/credit CSV columns already define the money direction and are not flipped for credit cards. Existing browser storage keys are retained for compatibility.

## Import flow

Overview also shows **Income** and **Remaining this month** for each currency. Remaining is categorized income minus net spending, without starting balances or bookkeeping transfers; it is not an account balance. Refunds reduce spending instead of being counted twice as income. Unknown deposits are excluded from income and shown in the breakdown; unresolved transactions make the remaining figure provisional.

Work by calendar month, not a rolling 30-day window. The month picker controls Overview, Transactions, category refresh, and every upload destination (Transactions, Shared Expenses, and Imported Ledger). It is available on Connections too. Importing a last-30-days export retains all its rows locally; dates outside the selected month are available when you switch months and are not uploaded until you select that month. Repeat weekly imports skip matching existing rows. Use the matching Monthly Budget copy for each month; changing the picker does not automatically change the connected spreadsheet. Full-ledger CSV export remains a backup of all months.

1. Sign in to each bank directly and export its transaction file. The app never asks for bank passwords.
2. Select multiple CSV, QFX, QBO, or OFX files together.
3. Confirm the bank and account type, then import one file or use **Import all rows** for all pending files. Review categories and optional shared-expense splits in Transactions.
4. Connect the Google Sheet and choose the calendar month and click **Upload [month]**.

The app detects the Monthly Budget template's separate Expenses and Income blocks. It keeps the full expense amount in the budget, writes all imported rows into a combined chronological **Imported Ledger** tab, and sends marked shared expenses to **Shared Expenses**. That sheet records the full charge, people in the split (including you), each person's share, and the total owed by the other people.

The optional setup panel writes the confirmed template targets: Summary!L8 for starting balance, D28:D38 for planned expenses, and J28:J33 for planned income. Planned values match the category labels within those ranges, including Food / Groceries. Blank fields are left untouched; zero is an explicit value. Invalid values or missing category labels stop the upload before transaction writes instead of silently skipping setup fields. Shared-expense rows are only generated for spending transactions; transfers, savings/investment contributions, and income are excluded from expense totals.

## Accounts, signs, transfers, and duplicates

Bookkeeping groups **Card payments**, **Savings transfers**, **Investments**, and **Transfers & Payments**. These entries stay in Imported Ledger for reconciliation but are excluded from spending and from the budget Transactions tab’s income/expense tables. The app creates Imported Ledger in the connected spreadsheet when needed. Existing Income → Savings rows migrate to Savings transfers without changing amounts, IDs, or import keys; existing uploaded sheet rows stay untouched. Card purchases count when charged; loan repayments and financing fees remain Debt expenses. Interest earned is Income → Interest. Amount rows show their current budget impact; Category status explains whether their category was suggested, manually reviewed, or needs review.

Generic bank descriptions such as `miscellaneous payment` or `customer transfer dr.` can be matched to explicit card-payment credits in another account: the amounts must be equal and opposite, currencies must match, dates must be within three days, and both rows must have a unique match. Equal amounts alone are insufficient. Recognized pairs are excluded consistently from Overview and new Sheets uploads. Existing uploaded rows are not rewritten. Generic descriptions such as `withdrawal`, `deposit`, or `bill payment` never teach blanket merchant rules; a manual category still applies to the individual reviewed row. Unidentified withdrawals remain included until reviewed.

Overview shows net spending for the selected month, with each currency shown separately. Categorized expense refunds reduce spending; unknown deposits do not. Income, transfers/card payments, and investments are excluded using current local suggestions, with manual categories taking priority. Uncategorized outflows remain included and the total is marked provisional until they are reviewed. Expand **What makes up this spending total?** to see charges, refunds, category totals, and pending uncategorized charges. This calculation does not change imported amounts or repair older sign mistakes.

Accounts are identified automatically by bank and account type, assuming one bank account and one credit card per institution. Existing imported labels and keys are preserved; older labels are matched using stored account type or recognizable card names when available.

The combined ledger uses one sign convention: money out is negative and money in is positive. Amount-only CSVs from bank accounts keep their signs; amount-only credit-card CSVs assume positive charges and negative refunds/payments, and flip them automatically. CSV debit/credit columns and QFX/QBO/OFX amounts already define direction and are kept as exported. Check the resulting amounts in Transactions before uploading.

Credit-card payments and account transfers are kept in the combined ledger but excluded from budget spending, so the bank-account payment and corresponding card-side credit do not count as two expenses. Transfers to investment accounts (including descriptions containing TFSA, FHSA, RRSP, Questrade, or Wealthsimple) are suggested as **Investments** under Bookkeeping and excluded from spending totals. They remain visible in the ledger for tracking.

Imports skip matching transactions already in this browser and duplicates earlier in the same batch. The Google Sheets upload also checks the Imported Ledger keys and existing budget rows before appending. Bank-provided transaction IDs make the strongest match; when a CSV has no ID, matching uses the bank, automatic account identity, date, description, amount, and currency. Exports with different descriptions or unrecognized older account labels can still need review.

## Supported file formats

After sign normalization, positive credit-card credits default to Income → Refunds unless identified as payments/transfers or explicitly assigned another income/bookkeeping rule. Merchant purchase rules do not turn credits into purchases. For amount-only card CSVs with positive charges, a negative raw amount becomes a positive ledger credit; negative ledger amounts still represent purchases/outflows. Manually reviewed transactions keep their categories. Bank deposits are not assumed to be refunds.

Bank and account type are detected locally from CSV metadata before the transaction header, explicit bank/account-type columns, card-specific column names, and OFX issuer/account tags. File contents take precedence over filename hints. The review shows whether each selection came from contents, filename, or a default. Generic date/description/amount CSVs may contain no issuer or account-type information; confirm the editable selections when detection is uncertain. Merchant descriptions and transaction signs are not used to identify the bank or account type.

- CSV exports with recognizable date, description, and amount columns
- QFX, QBO, and OFX exports containing standard OFX transaction blocks

The app stores transaction data and category rules in the current browser's local storage. Files are parsed locally. Use **Export ledger CSV** for a portable backup. Clearing browser data removes the local ledger.

Category suggestions use local merchant rules and user corrections. No AI service receives transaction details.

Expense categories follow the sheet: Food / Groceries, Gifts, Health/medical, Home, Transportation, Personal, Pets, Utilities, Travel, Debt, and Other. Income and Bookkeeping have separate dropdown groups. Groceries use Food / Groceries; restaurants, cafes, stores, subscriptions, and games use Personal. Loan repayments, mortgage payments, and financing fees use Debt. Positive payroll deposits and recognizable income credits use Income; positive loan proceeds are financing transfers. Investment contributions remain excluded from spending totals.

Suggestions use ordered local patterns and the normalized amount, with manual corrections taking priority. Corrections also match recurring descriptions with changed numeric references. Unknown merchants remain Uncategorized rather than being guessed. Use **Refresh suggestions** in Transactions to update suggested/uncategorized rows in the selected calendar month while keeping manually reviewed categories. Existing category names are mapped to the corresponding sheet names without changing transaction IDs, import keys, or amounts. Previously uploaded sheet rows are left unchanged; refreshing local categories does not append those charges again. Review suggestions before uploading, especially ambiguous merchants such as mixed grocery/retail stores.

Income rows show **Income · not spending**: they remain part of income and uploads, but do not increase the spending total. The app displays **Food / Groceries** and uploads the exact category label found in the connected template. The current template uses **Food / Groceries**; older templates using **Food** remain supported. Upload also repairs legacy Food labels in the selected month of Transactions in place, without appending duplicate charges.

## Google Sheets setup

Use [this Budget Bridge template](https://docs.google.com/spreadsheets/d/1X4qtICR-4SztmMrQv2Xogf7bVV46QVzLxO7X8ie9yU4/copy) to create your editable monthly budget copy, then paste the copy's URL into Connections. The app's Make a copy link uses this template. Changing the template link does not change your saved destination or transaction data.

**Refunds** is also available under Income. Positive refunds reduce Overview net spending; they are not earned income. Negative refund reversals increase spending. Explicit purchase-refund descriptions are suggested locally; tax refunds retain their separate income treatment. New uploads use the sheet income category Refunds when present, otherwise Other to support the original five-category template. Planned-income fields retain the original template categories.

Income choices are Paycheck, Bonus, Interest, Other, and Refunds, grouped separately from expenses and bookkeeping in the category selector and filters. Positive payroll deposits suggest Paycheck, bonuses suggest Bonus, and earned interest suggests Interest. Explicit income choices are preserved in new Sheets uploads; exports label them as `Income / Paycheck`, for example, to distinguish income Other from expense Other. Existing generic Income rows get a description-based label while keeping their IDs and amounts. Optional planned-income setup omits Savings; older saved Savings plans are not uploaded, leaving sheet values unchanged.

Sheets sync uses Google's browser OAuth flow and the Google Sheets API. OAuth configuration is managed at build time and has no visible settings in the app. The spreadsheet link stays in this browser; access tokens stay in memory.

1. Open [Google Cloud Console](https://console.cloud.google.com/), select or create a project, and enable the **Google Sheets API**.
2. Configure the OAuth consent screen. For personal use, choose External, keep the app in testing, and add your Google account as a test user.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**. Choose **Web application**.
4. Under **Authorized JavaScript origins**, add the exact origin where you run the app. Common origins:
   - Local development: `http://localhost:5173` (or the port Vite reports)
   - GitHub Pages: `https://YOUR-USERNAME.github.io` (origin only; omit the repository path)
5. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to your Web application client ID ending in `.apps.googleusercontent.com`. Restart Vite after changing it; production builds must be rebuilt. This browser token flow does not require an Authorized redirect URI.
6. Paste your own copy of the linked Monthly Budget sheet and click **Connect sheet**, then approve Sheets access. The app creates an **Imported Ledger** tab if needed and adds headers to a blank **Shared Expenses** tab.

If Google reports **“no registered origin”** or **Error 401: invalid_client**, the current site origin is missing from that OAuth client's **Authorized JavaScript origins**, or the client ID belongs to a different Google Cloud project. Origins must match exactly, including `http` vs `https` and any port. If running locally, open the Vite URL (normally `http://localhost:5173`), not the app as a `file://` page.

The OAuth client ID is a public identifier, not a secret. Moving it out of the visible UI does not hide it from browser code: Vite embeds `VITE_` variables in the build. Never set a Google client secret or service-account key in this app. Keeping tokens or secrets off the browser would require a backend and a different hosting design. Google's account chooser and consent remain part of connecting Sheets. Google may show an unverified-app warning while the OAuth project is in testing.

## GitHub Pages

1. Create a GitHub repository and push this project.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. In **Settings → Secrets and variables → Actions → Variables**, create a repository variable named `VITE_GOOGLE_CLIENT_ID` containing your public Web application client ID. When ready to publish, open **Actions → Deploy Budget Bridge → Run workflow** on `main`. Deployment is manual so pushing code does not publish the app automatically. GitHub Pages availability for a private repository depends on your GitHub plan.
4. Add the GitHub Pages origin to your Google OAuth client.

The repository contains app code only. Never commit transaction exports or the private budget sheet.
