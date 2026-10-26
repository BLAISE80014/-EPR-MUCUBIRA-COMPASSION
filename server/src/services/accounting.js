const ACCOUNT_TYPES = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);
const SOURCE_TYPES = new Set(['income', 'expense', 'transfer', 'adjustment', 'opening_balance', 'journal']);

function safeAdd(first, second) {
  const result = BigInt(first) + BigInt(second);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('A financial total exceeds the supported safe integer range.');
  }
  return Number(result);
}

function safeSubtract(first, second) {
  const result = BigInt(first) - BigInt(second);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('A financial total exceeds the supported safe integer range.');
  }
  return Number(result);
}

function validateJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 30) {
    return 'A journal entry must contain between 2 and 30 lines.';
  }
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    if (!line || !Number.isSafeInteger(line.debitMinor) || !Number.isSafeInteger(line.creditMinor)
      || line.debitMinor < 0 || line.creditMinor < 0
      || (line.debitMinor === 0) === (line.creditMinor === 0)) {
      return 'Each journal line must have one positive, whole-minor-unit debit or credit amount.';
    }
    debits += line.debitMinor;
    credits += line.creditMinor;
    if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits)) {
      return 'Journal totals exceed the supported safe integer range.';
    }
  }
  return debits === credits ? null : 'Total debits must equal total credits.';
}

function validateJournalComposition(sourceType, lines, accounts) {
  if (!SOURCE_TYPES.has(sourceType)) return 'Journal source type is invalid.';
  const accountsById = new Map(accounts.map((account) => [String(account._id), account]));
  const accountForLine = (line) => accountsById.get(String(line.accountId ?? line.account));
  const hasDebit = (predicate) => lines.some((line) => line.debitMinor > 0 && predicate(accountForLine(line)));
  const hasCredit = (predicate) => lines.some((line) => line.creditMinor > 0 && predicate(accountForLine(line)));

  if (sourceType === 'income' && (!hasCredit((account) => account?.type === 'revenue')
    || !hasDebit((account) => account?.type === 'asset'))) {
    return 'Income journals must debit an asset account and credit a revenue account.';
  }
  if (sourceType === 'expense' && (!hasDebit((account) => account?.type === 'expense')
    || !hasCredit((account) => account?.cashOrBank || account?.type === 'liability'))) {
    return 'Expense journals must debit an expense account and credit a cash, bank, or payable account.';
  }
  if (sourceType === 'transfer' && lines.some((line) => !accountForLine(line)?.cashOrBank)) {
    return 'Transfers may only move value between cash and bank accounts.';
  }
  if (sourceType === 'opening_balance') {
    if (lines.some((line) => ['revenue', 'expense'].includes(accountForLine(line)?.type))) {
      return 'Opening balance journals may only use balance-sheet accounts.';
    }
  }
  return null;
}

function accountBalanceMinor(type, debitMinor, creditMinor) {
  return ['asset', 'expense'].includes(type)
    ? safeSubtract(debitMinor, creditMinor)
    : safeSubtract(creditMinor, debitMinor);
}

function sumLedger(lines, accountsById) {
  const totals = new Map();
  for (const line of lines) {
    const id = String(line.account);
    const account = accountsById.get(id);
    if (!account) continue;
    const current = totals.get(id) || { debitMinor: 0, creditMinor: 0 };
    current.debitMinor = safeAdd(current.debitMinor, line.debitMinor);
    current.creditMinor = safeAdd(current.creditMinor, line.creditMinor);
    totals.set(id, current);
  }
  return [...totals].map(([id, values]) => {
    const account = accountsById.get(id);
    return {
      accountId: id,
      code: account.code,
      name: account.name,
      type: account.type,
      cashOrBank: account.cashOrBank,
      debitMinor: values.debitMinor,
      creditMinor: values.creditMinor,
      balanceMinor: accountBalanceMinor(account.type, values.debitMinor, values.creditMinor),
    };
  });
}

function yearDates(year, month) {
  const start = new Date(year.startDate);
  const end = new Date(year.endDate);
  if (month === undefined) return { start, end };
  const monthStart = new Date(Date.UTC(year.startDate.getUTCFullYear(), month - 1, 1));
  const monthEnd = new Date(Date.UTC(year.startDate.getUTCFullYear(), month, 0, 23, 59, 59, 999));
  const selectedStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
  const selectedEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));
  if (selectedStart > selectedEnd) return null;
  return { start: selectedStart, end: selectedEnd };
}

function summarizePostedEntries(entries, accounts) {
  const accountsById = new Map(accounts.map((account) => [String(account._id), account]));
  const lines = entries.flatMap((entry) => entry.lines);
  const balances = sumLedger(lines, accountsById);
  const incomeMinor = balances
    .filter((item) => item.type === 'revenue')
    .reduce((sum, item) => safeAdd(sum, item.balanceMinor), 0);
  const expensesMinor = balances
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => safeAdd(sum, item.balanceMinor), 0);
  const cashBankMinor = balances
    .filter((item) => item.cashOrBank)
    .reduce((sum, item) => safeAdd(sum, item.balanceMinor), 0);
  return {
    incomeMinor,
    expensesMinor,
    netSurplusMinor: safeSubtract(incomeMinor, expensesMinor),
    cashBankMinor,
    accounts: balances,
  };
}

module.exports = {
  ACCOUNT_TYPES,
  SOURCE_TYPES,
  accountBalanceMinor,
  safeAdd,
  safeSubtract,
  summarizePostedEntries,
  validateJournalComposition,
  validateJournalLines,
  yearDates,
};
