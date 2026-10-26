const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  accountBalanceMinor,
  safeAdd,
  summarizePostedEntries,
  validateJournalComposition,
  validateJournalLines,
  yearDates,
} = require('../src/services/accounting');

test('journal validation requires balanced positive integer debits and credits', () => {
  assert.equal(validateJournalLines([
    { debitMinor: 1250, creditMinor: 0 },
    { debitMinor: 0, creditMinor: 1250 },
  ]), null);
  assert.equal(validateJournalLines([
    { debitMinor: 1250, creditMinor: 0 },
    { debitMinor: 0, creditMinor: 1249 },
  ]), 'Total debits must equal total credits.');
  assert.match(validateJournalLines([
    { debitMinor: 1250.5, creditMinor: 0 },
    { debitMinor: 0, creditMinor: 1250.5 },
  ]), /whole-minor-unit/);
  assert.match(validateJournalLines([{ debitMinor: 0, creditMinor: 0 }]), /between 2 and 30/);
});

test('income, expense, and transfer journals use accounting-appropriate accounts', () => {
  const accounts = [
    { _id: 'cash', type: 'asset', cashOrBank: true },
    { _id: 'receivable', type: 'asset', cashOrBank: false },
    { _id: 'bank', type: 'asset', cashOrBank: true },
    { _id: 'payable', type: 'liability', cashOrBank: false },
    { _id: 'donations', type: 'revenue', cashOrBank: false },
    { _id: 'program-expense', type: 'expense', cashOrBank: false },
  ];
  assert.equal(validateJournalComposition('income', [
    { accountId: 'cash', debitMinor: 500, creditMinor: 0 },
    { accountId: 'donations', debitMinor: 0, creditMinor: 500 },
  ], accounts), null);
  assert.equal(validateJournalComposition('expense', [
    { accountId: 'program-expense', debitMinor: 200, creditMinor: 0 },
    { accountId: 'payable', debitMinor: 0, creditMinor: 200 },
  ], accounts), null);
  assert.equal(validateJournalComposition('transfer', [
    { accountId: 'cash', debitMinor: 100, creditMinor: 0 },
    { accountId: 'bank', debitMinor: 0, creditMinor: 100 },
  ], accounts), null);
  assert.match(validateJournalComposition('transfer', [
    { accountId: 'cash', debitMinor: 100, creditMinor: 0 },
    { accountId: 'donations', debitMinor: 0, creditMinor: 100 },
  ], accounts), /cash and bank/);
});

test('account balance uses debit-normal and credit-normal conventions', () => {
  assert.equal(accountBalanceMinor('asset', 20_000, 3_000), 17_000);
  assert.equal(accountBalanceMinor('expense', 10_000, 2_000), 8_000);
  assert.equal(accountBalanceMinor('liability', 4_000, 15_000), 11_000);
  assert.equal(accountBalanceMinor('revenue', 1_000, 18_000), 17_000);
});

test('financial totals fail explicitly instead of silently losing integer precision', () => {
  assert.throws(
    () => safeAdd(Number.MAX_SAFE_INTEGER, 1),
    { name: 'RangeError', message: /safe integer range/ },
  );
});

test('ledger summary excludes transfers from income and expense totals', () => {
  const accounts = [
    { _id: 'cash', code: '1000', name: 'Cash', type: 'asset', cashOrBank: true },
    { _id: 'income', code: '4000', name: 'Donations', type: 'revenue', cashOrBank: false },
    { _id: 'expense', code: '5000', name: 'Programs', type: 'expense', cashOrBank: false },
  ];
  const result = summarizePostedEntries([
    { lines: [
      { account: 'cash', debitMinor: 10_000, creditMinor: 0 },
      { account: 'income', debitMinor: 0, creditMinor: 10_000 },
    ] },
    { lines: [
      { account: 'expense', debitMinor: 2_500, creditMinor: 0 },
      { account: 'cash', debitMinor: 0, creditMinor: 2_500 },
    ] },
    { lines: [
      { account: 'cash', debitMinor: 0, creditMinor: 1_000 },
      { account: 'cash', debitMinor: 1_000, creditMinor: 0 },
    ] },
  ], accounts);

  assert.equal(result.incomeMinor, 10_000);
  assert.equal(result.expensesMinor, 2_500);
  assert.equal(result.netSurplusMinor, 7_500);
  assert.equal(result.cashBankMinor, 7_500);
});

test('calendar financial-year months are bounded by the configured year dates', () => {
  const year = {
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.999Z'),
  };
  assert.deepEqual(yearDates(year, 4), {
    start: new Date('2026-04-01T00:00:00.000Z'),
    end: new Date('2026-04-30T23:59:59.999Z'),
  });
  assert.equal(yearDates(year, 13), null);
});
