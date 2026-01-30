export type ProfitLossAccountRow = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
};

export type ProfitLossSection = {
  total: number;
  accounts: ProfitLossAccountRow[];
};

export type ProfitLossReport = {
  period: { startDate: string | null; endDate: string | null };
  comparePeriod: { startDate: string; endDate: string } | null;
  revenue: ProfitLossSection;
  cogs: ProfitLossSection;
  expenses: ProfitLossSection;
  grossProfit: number;
  netProfit: number;
  compare: {
    revenue: ProfitLossSection;
    cogs: ProfitLossSection;
    expenses: ProfitLossSection;
    grossProfit: number;
    netProfit: number;
  } | null;
};

export type BalanceSheetAccountRow = {
  accountId: string;
  code: string;
  name: string;
  amount: number;
};

export type BalanceSheetSection = {
  total: number;
  accounts: BalanceSheetAccountRow[];
};

export type BalanceSheetReport = {
  asOfDate: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  totals: {
    assets: number;
    liabilities: number;
    equity: number;
    liabilitiesEquity: number;
  };
  difference: number;
};

export type CashFlowAccountRow = {
  accountId: string;
  name: string;
  opening: number;
  change: number;
  closing: number;
};

export type CashFlowReport = {
  period: { startDate: string; endDate: string };
  openingCash: number;
  closingCash: number;
  netCashChange: number;
  netProfit: number;
  assetChange: number;
  liabilityChange: number;
  equityChange: number;
  netCashFromOperations: number;
  netCashFromInvesting: number;
  netCashFromFinancing: number;
  otherChange: number;
  cashAccounts: CashFlowAccountRow[];
};

type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense" | "cogs";
  isPosting: boolean;
};

type JournalEntry = {
  date: string;
  status: "posted" | "draft" | "void";
  lines: { accountId: string; debit: number; credit: number }[];
};

const isDateInRange = (date: string, startDate?: string | null, endDate?: string | null) => {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
};

const addToMap = (map: Map<string, number>, key: string, amount: number) => {
  if (Math.abs(amount) < 0.0001) {
    return;
  }
  map.set(key, (map.get(key) ?? 0) + amount);
};

const buildIncomeStatementSection = (
  accounts: Map<string, Account>,
  entries: JournalEntry[],
  types: Array<Account["type"]>,
  startDate?: string | null,
  endDate?: string | null
) => {
  const totals = new Map<string, number>();

  entries.forEach((entry) => {
    if (entry.status !== "posted") {
      return;
    }
    if (!isDateInRange(entry.date, startDate, endDate)) {
      return;
    }
    entry.lines.forEach((line) => {
      const account = accounts.get(line.accountId);
      if (!account || !account.isPosting || !types.includes(account.type)) {
        return;
      }
      const amount =
        account.type === "income"
          ? line.credit - line.debit
          : line.debit - line.credit;
      addToMap(totals, account.id, amount);
    });
  });

  const rows: ProfitLossAccountRow[] = Array.from(totals.entries())
    .map(([accountId, amount]) => {
      const account = accounts.get(accountId)!;
      return {
        accountId,
        code: account.code,
        name: account.name,
        amount,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { total, accounts: rows };
};

export const buildProfitLossReport = (params: {
  accounts: Account[];
  entries: JournalEntry[];
  startDate?: string | null;
  endDate?: string | null;
  compareStartDate?: string | null;
  compareEndDate?: string | null;
}): ProfitLossReport => {
  const accountMap = new Map(params.accounts.map((account) => [account.id, account]));

  const revenue = buildIncomeStatementSection(
    accountMap,
    params.entries,
    ["income"],
    params.startDate,
    params.endDate
  );
  const cogs = buildIncomeStatementSection(
    accountMap,
    params.entries,
    ["cogs"],
    params.startDate,
    params.endDate
  );
  const expenses = buildIncomeStatementSection(
    accountMap,
    params.entries,
    ["expense"],
    params.startDate,
    params.endDate
  );

  const grossProfit = revenue.total - cogs.total;
  const netProfit = grossProfit - expenses.total;

  let compare: ProfitLossReport["compare"] = null;
  if (params.compareStartDate && params.compareEndDate) {
    const compareRevenue = buildIncomeStatementSection(
      accountMap,
      params.entries,
      ["income"],
      params.compareStartDate,
      params.compareEndDate
    );
    const compareCogs = buildIncomeStatementSection(
      accountMap,
      params.entries,
      ["cogs"],
      params.compareStartDate,
      params.compareEndDate
    );
    const compareExpenses = buildIncomeStatementSection(
      accountMap,
      params.entries,
      ["expense"],
      params.compareStartDate,
      params.compareEndDate
    );
    const compareGross = compareRevenue.total - compareCogs.total;
    const compareNet = compareGross - compareExpenses.total;
    compare = {
      revenue: compareRevenue,
      cogs: compareCogs,
      expenses: compareExpenses,
      grossProfit: compareGross,
      netProfit: compareNet,
    };
  }

  return {
    period: { startDate: params.startDate ?? null, endDate: params.endDate ?? null },
    comparePeriod:
      params.compareStartDate && params.compareEndDate
        ? { startDate: params.compareStartDate, endDate: params.compareEndDate }
        : null,
    revenue,
    cogs,
    expenses,
    grossProfit,
    netProfit,
    compare,
  };
};

export const buildBalanceSheetReport = (params: {
  accounts: Account[];
  entries: JournalEntry[];
  asOfDate: string;
}): BalanceSheetReport => {
  const accountMap = new Map(params.accounts.map((account) => [account.id, account]));
  const balances = new Map<string, number>();

  params.entries.forEach((entry) => {
    if (entry.status !== "posted") {
      return;
    }
    if (entry.date > params.asOfDate) {
      return;
    }
    entry.lines.forEach((line) => {
      const account = accountMap.get(line.accountId);
      if (!account || !account.isPosting) {
        return;
      }
      if (account.type === "asset") {
        addToMap(balances, account.id, line.debit - line.credit);
      } else if (account.type === "liability" || account.type === "equity") {
        addToMap(balances, account.id, line.credit - line.debit);
      }
    });
  });

  const buildSection = (type: Account["type"]) => {
    const rows = params.accounts
      .filter((account) => account.isPosting && account.type === type)
      .map((account) => ({
        accountId: account.id,
        code: account.code,
        name: account.name,
        amount: balances.get(account.id) ?? 0,
      }))
      .filter((row) => Math.abs(row.amount) > 0.0001)
      .sort((a, b) => a.code.localeCompare(b.code));
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return { total, accounts: rows };
  };

  const assets = buildSection("asset");
  const liabilities = buildSection("liability");
  const equity = buildSection("equity");
  const liabilitiesEquity = liabilities.total + equity.total;
  const difference = assets.total - liabilitiesEquity;

  return {
    asOfDate: params.asOfDate,
    assets,
    liabilities,
    equity,
    totals: {
      assets: assets.total,
      liabilities: liabilities.total,
      equity: equity.total,
      liabilitiesEquity,
    },
    difference,
  };
};

export const buildCashFlowReport = (params: {
  accounts: Account[];
  entries: JournalEntry[];
  cashAccounts: { accountId: string; name: string; openingBalance?: number }[];
  startDate: string;
  endDate: string;
}): CashFlowReport => {
  const accountMap = new Map(params.accounts.map((account) => [account.id, account]));
  const cashAccountIds = new Set(params.cashAccounts.map((account) => account.accountId));

  const cashLinesByAccount = new Map<string, { opening: number; movement: number }>();
  params.cashAccounts.forEach((account) => {
    cashLinesByAccount.set(account.accountId, {
      opening: account.openingBalance ?? 0,
      movement: 0,
    });
  });

  const startBalances = new Map<string, number>();
  const endBalances = new Map<string, number>();

  params.entries.forEach((entry) => {
    if (entry.status !== "posted") {
      return;
    }
    const beforeStart = entry.date < params.startDate;
    const inRange = isDateInRange(entry.date, params.startDate, params.endDate);
    const beforeEnd = entry.date <= params.endDate;

    entry.lines.forEach((line) => {
      const account = accountMap.get(line.accountId);
      if (!account || !account.isPosting) {
        return;
      }

      if (cashAccountIds.has(line.accountId)) {
        const entryData = cashLinesByAccount.get(line.accountId) ?? {
          opening: 0,
          movement: 0,
        };
        const delta = line.debit - line.credit;
        if (beforeStart) {
          entryData.opening += delta;
        } else if (inRange) {
          entryData.movement += delta;
        }
        cashLinesByAccount.set(line.accountId, entryData);
      }

      if (account.type === "asset" || account.type === "liability" || account.type === "equity") {
        const amount =
          account.type === "asset" ? line.debit - line.credit : line.credit - line.debit;
        if (beforeEnd) {
          addToMap(endBalances, account.id, amount);
        }
        if (beforeStart) {
          addToMap(startBalances, account.id, amount);
        }
      }
    });
  });

  const cashAccounts = params.cashAccounts.map((account) => {
    const data = cashLinesByAccount.get(account.accountId) ?? {
      opening: account.openingBalance ?? 0,
      movement: 0,
    };
    const closing = data.opening + data.movement;
    return {
      accountId: account.accountId,
      name: account.name,
      opening: data.opening,
      change: data.movement,
      closing,
    };
  });

  const openingCash = cashAccounts.reduce((sum, account) => sum + account.opening, 0);
  const closingCash = cashAccounts.reduce((sum, account) => sum + account.closing, 0);
  const netCashChange = closingCash - openingCash;

  const netProfit = buildProfitLossReport({
    accounts: params.accounts,
    entries: params.entries,
    startDate: params.startDate,
    endDate: params.endDate,
  }).netProfit;

  let assetChange = 0;
  let liabilityChange = 0;
  let equityChange = 0;

  params.accounts.forEach((account) => {
    if (!account.isPosting) {
      return;
    }
    const start = startBalances.get(account.id) ?? 0;
    const end = endBalances.get(account.id) ?? 0;
    const delta = end - start;
    if (account.type === "asset") {
      if (!cashAccountIds.has(account.id)) {
        assetChange += delta;
      }
    } else if (account.type === "liability") {
      liabilityChange += delta;
    } else if (account.type === "equity") {
      equityChange += delta;
    }
  });

  const netCashFromOperations = netProfit - assetChange + liabilityChange;
  const netCashFromInvesting = 0;
  const netCashFromFinancing = equityChange;
  const otherChange =
    netCashChange - netCashFromOperations - netCashFromInvesting - netCashFromFinancing;

  return {
    period: { startDate: params.startDate, endDate: params.endDate },
    openingCash,
    closingCash,
    netCashChange,
    netProfit,
    assetChange,
    liabilityChange,
    equityChange,
    netCashFromOperations,
    netCashFromInvesting,
    netCashFromFinancing,
    otherChange,
    cashAccounts,
  };
};
