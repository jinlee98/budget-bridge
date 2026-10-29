export type AccountKind = 'bank' | 'card';

export type Institution = 'TD' | 'Scotiabank' | 'Tangerine' | 'American Express' | 'Other';

export type CategorySource = 'Rule' | 'Manual' | 'Uncategorized';

export type IncomeCategory = 'Savings' | 'Paycheck' | 'Bonus' | 'Interest' | 'Other' | 'Refunds';

export type RawTransaction = {
  date: string;
  postedDate: string;
  description: string;
  amount: number;
  currency: string;
  externalId: string;
  hasExplicitSign: boolean;
  signNormalized?: boolean;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  institution: Institution;
  accountKind: AccountKind;
  currency: string;
  rows: RawTransaction[];
  skipped: number;
  format: 'CSV' | 'QFX / OFX';
  detectionNote?: string;
};

export type Transaction = RawTransaction & {
  accountKind?: AccountKind;
  id: string;
  importKey: string;
  institution: Institution;
  accountName: string;
  category: string;
  incomeCategory?: IncomeCategory;
  categorySource: CategorySource;
  fileName: string;
  shared: boolean;
  splitCount: number;
};

export type GoogleWindow = Window & {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (options: {
          client_id: string;
          scope: string;
          callback: (response: {
            access_token?: string;
            error?: string;
          }) => void;
        }) => {
          requestAccessToken: (options?: {
            prompt?: string;
          }) => void;
        };
      };
    };
  };
};

export type TransactionSection = {
  kind: 'expense' | 'income';
  headerRow: number;
  columns: {
    date: number;
    amount: number;
    description: number;
    category: number;
  };
  left: number;
  right: number;
};

export type SummaryGrid = (string | number)[][];

export type SheetMerge = {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
};

export type SummaryLayout = {
  startingBalanceCell: string;
  expense: {
    firstRow: number;
    lastRow: number;
    labelCol: number;
    plannedCol: number;
  };
  income: {
    firstRow: number;
    lastRow: number;
    labelCol: number;
    plannedCol: number;
  };
};
