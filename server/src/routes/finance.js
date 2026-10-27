const express = require('express');
const mongoose = require('mongoose');
const FinancialAccount = require('../models/FinancialAccount');
const FinancialAuditLog = require('../models/FinancialAuditLog');
const FinancialYearGuard = require('../models/FinancialYearGuard');
const FinancialYear = require('../models/FinancialYear');
const JournalEntry = require('../models/JournalEntry');
const User = require('../models/User');
const { requireAuth, requireRoles } = require('../middleware/auth');
const {
  ACCOUNT_TYPES,
  SOURCE_TYPES,
  accountBalanceMinor,
  safeAdd,
  safeSubtract,
  validateJournalDetails,
  summarizePostedEntries,
  validateJournalMetadata,
  validateJournalComposition,
  validateJournalLines,
  yearDates,
} = require('../services/accounting');

const router = express.Router();
const FINANCE_ROLES = ['accountant', 'director'];
const STANDARD_ACCOUNTS = [
  ['1000', 'Cash on Hand', 'asset', true],
  ['1010', 'Bank Account', 'asset', true],
  ['1100', 'Accounts Receivable', 'asset', false],
  ['1500', 'Property and Equipment', 'asset', false],
  ['1590', 'Accumulated Depreciation', 'asset', false],
  ['2000', 'Accounts Payable', 'liability', false],
  ['3000', 'Organization Funds', 'equity', false],
  ['4000', 'Donations and Contributions', 'revenue', false],
  ['4100', 'Grants and Project Funding', 'revenue', false],
  ['4900', 'Other Income', 'revenue', false],
  ['5000', 'Program Expenses', 'expense', false],
  ['5100', 'Staff and Administration Expenses', 'expense', false],
  ['5200', 'Asset Depreciation Expense', 'expense', false],
];

router.use(requireAuth);
router.use(requireRoles(...FINANCE_ROLES));

function transactionCapability() {
  const topologyType = mongoose.connection.client?.topology?.description?.type || 'Disconnected';
  return {
    topologyType,
    supported: ['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced'].includes(topologyType),
  };
}

function requireTransactionSupport(req, res, next) {
  const capability = transactionCapability();
  if (capability.supported) return next();
  return res.status(503).json({
    message: `Financial records cannot be saved because MongoDB is ${capability.topologyType}. Start MongoDB as a transaction-capable replica set or sharded cluster, then restart the API.`,
    code: 'MONGODB_TRANSACTIONS_REQUIRED',
    topologyType: capability.topologyType,
  });
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

function isDateOnly(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function audit(actor, action, resourceType, resourceId, details = {}, reason = '', session) {
  await FinancialAuditLog.create(
    [{ actor: actor._id, action, resourceType, resourceId, details, reason }],
    { session },
  );
}

async function touchFinancialYear(year, session) {
  year.updatedAt = new Date();
  await year.save({ session });
}

function serializeYear(year) {
  return {
    id: String(year._id),
    name: year.name,
    startDate: year.startDate.toISOString().slice(0, 10),
    endDate: year.endDate.toISOString().slice(0, 10),
    status: year.status,
    closedAt: year.closedAt,
    createdAt: year.createdAt,
  };
}

router.get('/years', async (req, res) => {
  const years = await FinancialYear.find().sort({ startDate: -1 }).lean();
  return res.json({ years: years.map(serializeYear) });
});

router.get('/capabilities', (req, res) => {
  const capability = transactionCapability();
  return res.json({
    ...capability,
    writeMessage: capability.supported
      ? ''
      : `This database is ${capability.topologyType}; financial writes require MongoDB configured as a replica set or sharded cluster. See README.md for local setup steps.`,
  });
});

router.post('/years', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  const { name, startDate, endDate } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 40
    || !isDateOnly(startDate) || !isDateOnly(endDate)
    || new Date(startDate) >= new Date(endDate)
    || !/^\d{4}-01-01$/.test(startDate)
    || !/^\d{4}-12-31$/.test(endDate)
    || startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    return res.status(400).json({ message: 'Financial years must use valid January 1 through December 31 dates for one calendar year.' });
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);
  let overlap = false;
  const year = await withTransaction(async (session) => {
    await FinancialYearGuard.findOneAndUpdate(
      { _id: 'calendar-year-creation' },
      { $inc: { revision: 1 } },
      { upsert: true, new: true, session },
    );
    overlap = Boolean(await FinancialYear.exists({
      startDate: { $lte: end },
      endDate: { $gte: start },
    }).session(session));
    if (overlap) return null;
    const [created] = await FinancialYear.create(
      [{ name: name.trim(), startDate: start, endDate: end, createdBy: req.user._id }],
      { session },
    );
    await audit(req.user, 'financial_year.created', 'financial_year', created._id, {
      name: created.name, startDate: created.startDate, endDate: created.endDate,
    }, '', session);
    return created;
  });
  if (overlap) return res.status(409).json({ message: 'Financial years cannot overlap.' });
  return res.status(201).json({ year: serializeYear(year) });
});

router.post('/years/:id/close', requireRoles('director'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Financial year identifier is invalid.' });
  let errorStatus = 0;
  let errorMessage = '';
  const year = await withTransaction(async (session) => {
    const found = await FinancialYear.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Financial year not found.';
      return null;
    }
    if (found.status === 'closed') {
      errorStatus = 409;
      errorMessage = 'This financial year is already closed.';
      return null;
    }
    const pending = await JournalEntry.exists({
      financialYear: found._id,
      status: { $in: ['draft', 'submitted'] },
    }).session(session);
    if (pending) {
      errorStatus = 409;
      errorMessage = 'Submit or clear all draft and submitted journal entries before closing the year.';
      return null;
    }
    found.status = 'closed';
    found.closedAt = new Date();
    found.closedBy = req.user._id;
    await found.save({ session });
    await audit(req.user, 'financial_year.closed', 'financial_year', found._id, { closedAt: found.closedAt }, '', session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ year: serializeYear(year) });
});

router.post('/years/:id/reopen', requireRoles('director'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Financial year identifier is invalid.' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 10 || reason.length > 500) {
    return res.status(400).json({ message: 'Provide a reason between 10 and 500 characters to reopen a year.' });
  }
  let errorStatus = 0;
  let errorMessage = '';
  const year = await withTransaction(async (session) => {
    const found = await FinancialYear.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Financial year not found.';
      return null;
    }
    if (found.status !== 'closed') {
      errorStatus = 409;
      errorMessage = 'Only a closed year can be reopened.';
      return null;
    }
    found.status = 'open';
    found.reopenedAt = new Date();
    found.reopenedBy = req.user._id;
    found.reopenReason = reason;
    await found.save({ session });
    await audit(req.user, 'financial_year.reopened', 'financial_year', found._id, {}, reason, session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ year: serializeYear(year) });
});

router.get('/accounts', async (req, res) => {
  const accounts = await FinancialAccount.find().sort({ code: 1 }).lean();
  if (accounts.some((account) => account.currency !== req.app.locals.accountingCurrency)) {
    return res.status(409).json({
      message: 'The configured base currency differs from existing accounts. Restore the original currency or perform an approved migration.',
    });
  }
  return res.json({
    currency: req.app.locals.accountingCurrency,
    minorUnitDigits: req.app.locals.accountingCurrencyDigits,
    accounts,
  });
});

router.get('/employees', async (req, res) => {
  const employees = await User.find({
    active: true,
    role: { $nin: ['pending', 'parent', 'member'] },
  }).select('_id name email department role').sort({ name: 1 }).lean();
  return res.json({ employees });
});

router.post('/accounts/standard-chart', requireRoles('accountant', 'director'), requireTransactionSupport, async (req, res) => {
  const currency = req.app.locals.accountingCurrency;
  const accounts = await withTransaction(async (session) => {
    const createdAccounts = [];
    for (const [code, name, type, cashOrBank] of STANDARD_ACCOUNTS) {
      const account = await FinancialAccount.findOneAndUpdate(
        { code },
        { $setOnInsert: { code, name, type, cashOrBank, currency, createdBy: req.user._id } },
        { upsert: true, new: true, runValidators: true, session },
      );
      if (account.currency !== currency) {
        throw new Error(`Chart account ${account.code} uses ${account.currency}; the configured base currency is ${currency}.`);
      }
      createdAccounts.push(account);
    }
    await audit(req.user, 'chart_of_accounts.initialized', 'chart_of_accounts', createdAccounts[0]._id, { count: createdAccounts.length }, '', session);
    return createdAccounts;
  });
  return res.status(201).json({ currency, accounts });
});

router.post('/accounts', requireRoles('accountant', 'director'), requireTransactionSupport, async (req, res) => {
  const { code, name, type, cashOrBank = false } = req.body || {};
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{2,20}$/.test(code.trim())
    || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 120
    || !ACCOUNT_TYPES.has(type) || typeof cashOrBank !== 'boolean'
    || (cashOrBank && type !== 'asset')) {
    return res.status(400).json({ message: 'Provide a valid account code, name, account type, and cash/bank setting.' });
  }
  const account = await withTransaction(async (session) => {
    const [created] = await FinancialAccount.create([{
      code: code.trim().toUpperCase(),
      name: name.trim(),
      type,
      cashOrBank,
      currency: req.app.locals.accountingCurrency,
      createdBy: req.user._id,
    }], { session });
    await audit(req.user, 'financial_account.created', 'financial_account', created._id, {
      code: created.code, name: created.name, type: created.type, cashOrBank: created.cashOrBank,
    }, '', session);
    return created;
  });
  return res.status(201).json({ account });
});

router.post('/daily-transactions', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  const {
    reference, entryDate, financialYearId, description, sourceType, currency, amountMinor,
    paymentMethod = '', counterparty = '', categoryAccountId = null,
    supportingDocumentUrl = '', notes = '',
  } = req.body || {};
  const metadataError = validateJournalMetadata({
    reference, entryDate, description, sourceType, currency,
  }, req.app.locals.accountingCurrency);
  if (metadataError) return res.status(400).json({ message: metadataError });
  if (!['income', 'expense'].includes(sourceType)) {
    return res.status(400).json({ message: 'Daily transactions must be income or expense.' });
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ message: 'Enter an amount greater than zero using whole currency minor units.' });
  }
  if (!mongoose.isValidObjectId(financialYearId)) {
    return res.status(400).json({ message: 'Select a valid financial year.' });
  }
  if (categoryAccountId && !mongoose.isValidObjectId(categoryAccountId)) {
    return res.status(400).json({ message: 'Choose a valid transaction category.' });
  }
  const detailsError = validateJournalDetails({ paymentMethod, counterparty, supportingDocumentUrl, notes });
  if (detailsError) return res.status(400).json({ message: detailsError });
  const date = new Date(`${entryDate}T00:00:00.000Z`);
  const referenceValue = reference.trim().toUpperCase();
  let errorStatus = 0;
  let errorMessage = '';
  let duplicate = false;

  const entry = await withTransaction(async (session) => {
    const existing = await JournalEntry.findOne({ reference: referenceValue }).session(session);
    if (existing) {
      const samePayload = String(existing.createdBy) === String(req.user._id)
        && existing.sourceType === sourceType
        && existing.entryDate.getTime() === date.getTime()
        && existing.description === description.trim()
        && existing.counterparty === counterparty.trim()
        && existing.paymentMethod === paymentMethod
        && existing.currency === currency
        && existing.supportingDocumentUrl === supportingDocumentUrl.trim()
        && existing.notes === notes.trim()
        && existing.lines.length === 2
        && existing.lines.every((line) => line.debitMinor === amountMinor || line.creditMinor === amountMinor)
        && (!categoryAccountId || existing.lines.some((line) => String(line.account) === String(categoryAccountId)));
      if (samePayload) {
        if (existing.status === 'submitted') {
          const year = await FinancialYear.findById(existing.financialYear).session(session);
          if (!year || year.status !== 'open') {
            errorStatus = 409;
            errorMessage = 'This transaction is awaiting review, but its financial year is no longer open.';
            return null;
          }
          existing.status = 'posted';
          existing.postedAt = new Date();
          await existing.save({ session });
          await touchFinancialYear(year, session);
          await audit(req.user, 'journal_entry.daily_transaction_posted', 'journal_entry', existing._id, {
            reference: existing.reference,
            sourceType: existing.sourceType,
            amountMinor,
            postedAt: existing.postedAt,
            promotedFromSubmitted: true,
          }, '', session);
          duplicate = true;
          return existing;
        }
        if (existing.status !== 'posted') {
          errorStatus = 409;
          errorMessage = 'A matching draft already exists. Open transaction history and submit or correct that draft before retrying.';
          return null;
        }
        duplicate = true;
        return existing;
      }
      errorStatus = 409;
      errorMessage = 'This reference has already been used. Use a new reference for a different transaction.';
      return null;
    }

    const year = await FinancialYear.findById(financialYearId).session(session);
    if (!year) {
      errorStatus = 400;
      errorMessage = 'Select an existing financial year.';
      return null;
    }
    if (year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Transactions can only be recorded in an open financial year.';
      return null;
    }
    if (date < year.startDate || date > year.endDate) {
      errorStatus = 400;
      errorMessage = 'The transaction date must fall within the selected financial year.';
      return null;
    }

    const categoryType = sourceType === 'income' ? 'revenue' : 'expense';
    const accounts = await FinancialAccount.find({ active: true, currency }).sort({ code: 1 }).session(session);
    const cashAccount = accounts.find((account) => account.cashOrBank);
    const categoryAccount = categoryAccountId
      ? accounts.find((account) => String(account._id) === String(categoryAccountId) && account.type === categoryType)
      : accounts.find((account) => account.type === categoryType);
    if (!cashAccount || !categoryAccount) {
      errorStatus = 409;
      errorMessage = 'The finance chart is not ready for this transaction type. Ask a Director to initialize the standard chart.';
      return null;
    }

    const lines = sourceType === 'income'
      ? [
          { accountId: cashAccount._id, debitMinor: amountMinor, creditMinor: 0 },
          { accountId: categoryAccount._id, debitMinor: 0, creditMinor: amountMinor },
        ]
      : [
          { accountId: categoryAccount._id, debitMinor: amountMinor, creditMinor: 0 },
          { accountId: cashAccount._id, debitMinor: 0, creditMinor: amountMinor },
        ];
    const linesError = validateJournalLines(lines);
    if (linesError) {
      errorStatus = 400;
      errorMessage = linesError;
      return null;
    }
    const compositionError = validateJournalComposition(sourceType, lines, accounts);
    if (compositionError) {
      errorStatus = 400;
      errorMessage = compositionError;
      return null;
    }

    await touchFinancialYear(year, session);
    const postedAt = new Date();
    const [created] = await JournalEntry.create([{
      reference: referenceValue,
      entryDate: date,
      financialYear: year._id,
      periodId: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      description: description.trim(),
      sourceType,
      paymentMethod,
      counterparty: counterparty.trim(),
      supportingDocumentUrl: supportingDocumentUrl.trim(),
      notes: notes.trim(),
      currency,
      lines: lines.map((line, index) => ({
        account: line.accountId,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        description: index === 0 && sourceType === 'income'
          ? 'Cash or bank received'
          : index === 1 && sourceType === 'expense'
            ? 'Cash or bank payment'
            : description.trim(),
      })),
      createdBy: req.user._id,
      status: 'posted',
      postedAt,
    }], { session });
    await audit(req.user, 'journal_entry.daily_transaction_posted', 'journal_entry', created._id, {
      reference: created.reference,
      sourceType: created.sourceType,
      amountMinor,
      postedAt,
    }, '', session);
    return created;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.status(duplicate ? 200 : 201).json({ entry, duplicate });
});

router.get('/journal-entries', async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const filter = {};
  if (req.query.yearId) {
    if (!mongoose.isValidObjectId(req.query.yearId)) return res.status(400).json({ message: 'Financial year filter is invalid.' });
    filter.financialYear = req.query.yearId;
  }
  if (req.query.status) {
    if (!['draft', 'submitted', 'posted'].includes(req.query.status)) return res.status(400).json({ message: 'Journal status filter is invalid.' });
    filter.status = req.query.status;
  }
  if (req.query.sourceType) {
    if (!SOURCE_TYPES.has(req.query.sourceType)) return res.status(400).json({ message: 'Journal source type filter is invalid.' });
    filter.sourceType = req.query.sourceType;
  }
  if (req.query.paymentMethod) {
    filter.paymentMethod = req.query.paymentMethod;
  }
  const dateRange = {};
  if (req.query.from) {
    if (!isDateOnly(req.query.from)) return res.status(400).json({ message: 'Start date filter is invalid.' });
    dateRange.$gte = new Date(`${req.query.from}T00:00:00.000Z`);
  }
  if (req.query.to) {
    if (!isDateOnly(req.query.to)) return res.status(400).json({ message: 'End date filter is invalid.' });
    dateRange.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  if (dateRange.$gte && dateRange.$lte && dateRange.$gte > dateRange.$lte) {
    return res.status(400).json({ message: 'Start date must be on or before the end date.' });
  }
  if (Object.keys(dateRange).length) filter.entryDate = dateRange;
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const term = escapeRegex(req.query.search.trim().slice(0, 100));
    const expression = new RegExp(term, 'i');
    filter.$or = [{ reference: expression }, { description: expression }, { counterparty: expression }];
  }
  const [entries, total] = await Promise.all([
    JournalEntry.find(filter)
      .populate('lines.account', 'code name type cashOrBank')
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .populate('responsibleEmployee', 'name email department role')
      .sort({ entryDate: -1, createdAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    JournalEntry.countDocuments(filter),
  ]);
  return res.json({ entries, page, limit, total });
});

router.post('/journal-entries', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  const {
    reference, entryDate, financialYearId, description, sourceType = 'journal', currency, lines,
    paymentMethod = '', counterparty = '', responsibleEmployee = null, projectReference = '',
    supportingDocumentUrl = '', notes = '',
  } = req.body || {};
  const metadataError = validateJournalMetadata({
    reference, entryDate, description, sourceType, currency,
  }, req.app.locals.accountingCurrency);
  if (metadataError) return res.status(400).json({ message: metadataError });
  if (!mongoose.isValidObjectId(financialYearId)) {
    return res.status(400).json({ message: 'Select a valid financial year.' });
  }
  const detailsError = validateJournalDetails({ paymentMethod, counterparty, projectReference, supportingDocumentUrl, notes });
  if (detailsError) return res.status(400).json({ message: detailsError });
  if (responsibleEmployee && !mongoose.isValidObjectId(responsibleEmployee)) {
    return res.status(400).json({ message: 'Select a valid responsible employee.' });
  }
  const linesError = validateJournalLines(lines);
  if (linesError) return res.status(400).json({ message: linesError });
  const date = new Date(`${entryDate}T00:00:00.000Z`);
  const accountIds = lines.map((line) => line.accountId);
  if (accountIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: 'Select a valid account for every journal line.' });
  }
  const uniqueAccountIds = [...new Set(accountIds)];
  let errorStatus = 0;
  let errorMessage = '';
  const entry = await withTransaction(async (session) => {
    const year = await FinancialYear.findById(financialYearId).session(session);
    if (!year) {
      errorStatus = 400;
      errorMessage = 'Select an existing financial year.';
      return null;
    }
    if (year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Journal entries can only be recorded in an open financial year.';
      return null;
    }
    if (date < year.startDate || date > year.endDate) {
      errorStatus = 400;
      errorMessage = 'The journal date must fall within the selected financial year.';
      return null;
    }
    if (sourceType === 'opening_balance' && date.getTime() !== year.startDate.getTime()) {
      errorStatus = 400;
      errorMessage = 'Opening balances must be dated on the first day of the financial year.';
      return null;
    }
    const accounts = await FinancialAccount.find({ _id: { $in: uniqueAccountIds }, active: true }).session(session);
    if (accounts.length !== uniqueAccountIds.length || accounts.some((account) => account.currency !== currency)) {
      errorStatus = 400;
      errorMessage = 'All journal lines must reference active accounts in the configured base currency.';
      return null;
    }
    if (responsibleEmployee && !(await User.exists({
      _id: responsibleEmployee,
      active: true,
      role: { $nin: ['pending', 'parent', 'member'] },
    }).session(session))) {
      errorStatus = 400;
      errorMessage = 'Select an active organization employee.';
      return null;
    }
    await touchFinancialYear(year, session);
    const [created] = await JournalEntry.create([{
      reference: reference.trim().toUpperCase(),
      entryDate: date,
      financialYear: year._id,
      periodId: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      description: description.trim(),
      sourceType,
      paymentMethod,
      counterparty: counterparty.trim(),
      responsibleEmployee: responsibleEmployee || null,
      projectReference: projectReference.trim(),
      supportingDocumentUrl: supportingDocumentUrl.trim(),
      notes: notes.trim(),
      currency,
      lines: lines.map((line) => ({
        account: line.accountId,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        description: typeof line.description === 'string' ? line.description.trim().slice(0, 300) : '',
      })),
      createdBy: req.user._id,
    }], { session });
    await audit(req.user, 'journal_entry.created', 'journal_entry', created._id, {
      reference: created.reference,
      status: created.status,
      sourceType: created.sourceType,
      paymentMethod: created.paymentMethod,
      counterparty: created.counterparty,
      responsibleEmployee: created.responsibleEmployee,
      projectReference: created.projectReference,
      lineCount: created.lines.length,
    }, '', session);
    return created;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.status(201).json({ entry });
});

router.patch('/journal-entries/:id', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  const {
    reference, entryDate, financialYearId, description, sourceType = 'journal', currency, lines,
    paymentMethod = '', counterparty = '', responsibleEmployee = null, projectReference = '',
    supportingDocumentUrl = '', notes = '',
  } = req.body || {};
  const metadataError = validateJournalMetadata({
    reference, entryDate, description, sourceType, currency,
  }, req.app.locals.accountingCurrency);
  if (metadataError) return res.status(400).json({ message: metadataError });
  if (!mongoose.isValidObjectId(financialYearId)) {
    return res.status(400).json({ message: 'Select a valid financial year.' });
  }
  const detailsError = validateJournalDetails({ paymentMethod, counterparty, projectReference, supportingDocumentUrl, notes });
  if (detailsError) return res.status(400).json({ message: detailsError });
  if (responsibleEmployee && !mongoose.isValidObjectId(responsibleEmployee)) {
    return res.status(400).json({ message: 'Select a valid responsible employee.' });
  }
  const linesError = validateJournalLines(lines);
  if (linesError) return res.status(400).json({ message: linesError });
  const date = new Date(`${entryDate}T00:00:00.000Z`);
  const accountIds = lines.map((line) => line.accountId);
  if (accountIds.some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: 'Select a valid account for every journal line.' });
  }
  const uniqueAccountIds = [...new Set(accountIds)];
  let errorStatus = 0;
  let errorMessage = '';
  const entry = await withTransaction(async (session) => {
    const found = await JournalEntry.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return null;
    }
    if (String(found.createdBy) !== String(req.user._id)) {
      errorStatus = 403;
      errorMessage = 'Only the creator can edit this journal entry.';
      return null;
    }
    if (found.status !== 'draft') {
      errorStatus = 409;
      errorMessage = 'Only a draft journal entry can be edited.';
      return null;
    }
    if (String(found.financialYear) !== financialYearId) {
      errorStatus = 400;
      errorMessage = 'A draft journal entry cannot be moved to another financial year.';
      return null;
    }
    const year = await FinancialYear.findById(financialYearId).session(session);
    if (!year || year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Select an existing open financial year.';
      return null;
    }
    if (date < year.startDate || date > year.endDate) {
      errorStatus = 400;
      errorMessage = 'The journal date must fall within the selected financial year.';
      return null;
    }
    if (sourceType === 'opening_balance' && date.getTime() !== year.startDate.getTime()) {
      errorStatus = 400;
      errorMessage = 'Opening balances must be dated on the first day of the financial year.';
      return null;
    }
    const duplicate = await JournalEntry.exists({
      reference: reference.trim().toUpperCase(),
      _id: { $ne: found._id },
    }).session(session);
    if (duplicate) {
      errorStatus = 409;
      errorMessage = 'A journal entry already uses this reference.';
      return null;
    }
    const accounts = await FinancialAccount.find({ _id: { $in: uniqueAccountIds }, active: true }).session(session);
    if (accounts.length !== uniqueAccountIds.length || accounts.some((account) => account.currency !== currency)) {
      errorStatus = 400;
      errorMessage = 'All journal lines must reference active accounts in the configured base currency.';
      return null;
    }
    if (responsibleEmployee && !(await User.exists({
      _id: responsibleEmployee,
      active: true,
      role: { $nin: ['pending', 'parent', 'member'] },
    }).session(session))) {
      errorStatus = 400;
      errorMessage = 'Select an active organization employee.';
      return null;
    }
    const before = {
      reference: found.reference,
      entryDate: found.entryDate,
      financialYear: String(found.financialYear),
      description: found.description,
      sourceType: found.sourceType,
      paymentMethod: found.paymentMethod,
      counterparty: found.counterparty,
      responsibleEmployee: found.responsibleEmployee ? String(found.responsibleEmployee) : null,
      projectReference: found.projectReference,
      supportingDocumentUrl: found.supportingDocumentUrl,
      notes: found.notes,
      lines: found.lines.map((line) => ({
        account: String(line.account),
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        description: line.description,
      })),
    };
    await touchFinancialYear(year, session);
    found.reference = reference.trim().toUpperCase();
    found.entryDate = date;
    found.financialYear = year._id;
    found.periodId = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    found.description = description.trim();
    found.sourceType = sourceType;
    found.paymentMethod = paymentMethod;
    found.counterparty = counterparty.trim();
    found.responsibleEmployee = responsibleEmployee || null;
    found.projectReference = projectReference.trim();
    found.supportingDocumentUrl = supportingDocumentUrl.trim();
    found.notes = notes.trim();
    found.currency = currency;
    found.lines = lines.map((line) => ({
      account: line.accountId,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      description: typeof line.description === 'string' ? line.description.trim().slice(0, 300) : '',
    }));
    await found.save({ session });
    await audit(req.user, 'journal_entry.draft_updated', 'journal_entry', found._id, {
      before,
      after: {
        reference: found.reference,
        entryDate: found.entryDate,
        financialYear: String(found.financialYear),
        description: found.description,
        sourceType: found.sourceType,
        paymentMethod: found.paymentMethod,
        counterparty: found.counterparty,
        responsibleEmployee: found.responsibleEmployee ? String(found.responsibleEmployee) : null,
        projectReference: found.projectReference,
        supportingDocumentUrl: found.supportingDocumentUrl,
        notes: found.notes,
        lines: found.lines.map((line) => ({
          account: String(line.account),
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          description: line.description,
        })),
      },
    }, '', session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ entry });
});

router.post('/journal-entries/:id/submit', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  let errorStatus = 0;
  let errorMessage = '';
  const entry = await withTransaction(async (session) => {
    const found = await JournalEntry.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return null;
    }
    if (String(found.createdBy) !== String(req.user._id)) {
      errorStatus = 403;
      errorMessage = 'Only the entry creator can submit this journal entry.';
      return null;
    }
    if (found.status !== 'draft') {
      errorStatus = 409;
      errorMessage = 'Only a draft journal entry can be submitted.';
      return null;
    }
    const year = await FinancialYear.findById(found.financialYear).session(session);
    if (!year || year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Journal entries can only be submitted in an open financial year.';
      return null;
    }
    await touchFinancialYear(year, session);
    found.status = 'submitted';
    found.submittedAt = new Date();
    await found.save({ session });
    await audit(req.user, 'journal_entry.submitted', 'journal_entry', found._id, { reference: found.reference }, '', session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ entry });
});

router.delete('/journal-entries/:id', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  let errorStatus = 0;
  let errorMessage = '';
  const deleted = await withTransaction(async (session) => {
    const entry = await JournalEntry.findById(req.params.id).session(session);
    if (!entry) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return false;
    }
    if (String(entry.createdBy) !== String(req.user._id) || entry.status !== 'draft') {
      errorStatus = 403;
      errorMessage = 'Only your own draft journal entries can be deleted. Submitted and posted entries are retained.';
      return false;
    }
    const year = await FinancialYear.findById(entry.financialYear).session(session);
    if (!year || year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Draft entries in a closed year cannot be deleted.';
      return false;
    }
    await touchFinancialYear(year, session);
    await JournalEntry.deleteOne({ _id: entry._id, status: 'draft' }, { session });
    await audit(req.user, 'journal_entry.draft_deleted', 'journal_entry', entry._id, {
      reference: entry.reference,
      preservedDescription: entry.description,
    }, '', session);
    return true;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ deleted });
});

router.post('/journal-entries/:id/return', requireRoles('director'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 5 || reason.length > 500) {
    return res.status(400).json({ message: 'Provide a return comment between 5 and 500 characters.' });
  }
  let errorStatus = 0;
  let errorMessage = '';
  const entry = await withTransaction(async (session) => {
    const found = await JournalEntry.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return null;
    }
    if (String(found.createdBy) === String(req.user._id)) {
      errorStatus = 403;
      errorMessage = 'A Director cannot return their own journal entry.';
      return null;
    }
    if (found.status !== 'submitted') {
      errorStatus = 409;
      errorMessage = 'Only a submitted journal entry can be returned.';
      return null;
    }
    const year = await FinancialYear.findById(found.financialYear).session(session);
    if (!year || year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'The journal entry financial year is not open.';
      return null;
    }
    await touchFinancialYear(year, session);
    found.status = 'draft';
    found.reviewComment = reason;
    found.returnedAt = new Date();
    found.submittedAt = null;
    await found.save({ session });
    await audit(req.user, 'journal_entry.returned', 'journal_entry', found._id, { reference: found.reference }, reason, session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ entry });
});

router.post('/journal-entries/:id/reverse', requireRoles('accountant'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  const { reference, entryDate, financialYearId, description } = req.body || {};
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{2,40}$/.test(reference.trim())
    || !isDateOnly(entryDate) || !mongoose.isValidObjectId(financialYearId)
    || typeof description !== 'string' || description.trim().length < 3 || description.trim().length > 500) {
    return res.status(400).json({ message: 'Provide a valid reversal reference, date, financial year, and description.' });
  }
  let errorStatus = 0;
  let errorMessage = '';
  const reversal = await withTransaction(async (session) => {
    const original = await JournalEntry.findById(req.params.id).session(session);
    if (!original) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return null;
    }
    if (original.status !== 'posted') {
      errorStatus = 409;
      errorMessage = 'Only a posted journal entry can be reversed.';
      return null;
    }
    if (await JournalEntry.exists({ reversalOf: original._id }).session(session)) {
      errorStatus = 409;
      errorMessage = 'This journal entry already has a reversal.';
      return null;
    }
    const year = await FinancialYear.findById(financialYearId).session(session);
    if (!year) {
      errorStatus = 400;
      errorMessage = 'Select an existing financial year for the reversal.';
      return null;
    }
    if (year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'Reversals can only be recorded in an open financial year.';
      return null;
    }
    const date = new Date(`${entryDate}T00:00:00.000Z`);
    if (date < year.startDate || date > year.endDate) {
      errorStatus = 400;
      errorMessage = 'The reversal date must fall within its selected financial year.';
      return null;
    }
    await touchFinancialYear(year, session);
    const [created] = await JournalEntry.create([{
      reference: reference.trim().toUpperCase(),
      entryDate: date,
      financialYear: year._id,
      periodId: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      reversalOf: original._id,
      description: description.trim(),
      sourceType: 'adjustment',
      currency: original.currency,
      lines: original.lines.map((line) => ({
        account: line.account,
        debitMinor: line.creditMinor,
        creditMinor: line.debitMinor,
        description: `Reversal of ${original.reference}`,
      })),
      createdBy: req.user._id,
    }], { session });
    await audit(req.user, 'journal_entry.reversal_created', 'journal_entry', created._id, {
      reference: created.reference,
      reversalOf: String(original._id),
      originalReference: original.reference,
    }, description.trim(), session);
    return created;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.status(201).json({ entry: reversal });
});

router.post('/journal-entries/:id/approve', requireRoles('director'), requireTransactionSupport, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Journal entry identifier is invalid.' });
  let errorStatus = 0;
  let errorMessage = '';
  const entry = await withTransaction(async (session) => {
    const found = await JournalEntry.findById(req.params.id).session(session);
    if (!found) {
      errorStatus = 404;
      errorMessage = 'Journal entry not found.';
      return null;
    }
    if (String(found.createdBy) === String(req.user._id)) {
      errorStatus = 403;
      errorMessage = 'A Director cannot approve their own journal entry.';
      return null;
    }
    if (found.status !== 'submitted') {
      errorStatus = 409;
      errorMessage = 'Only a submitted journal entry can be approved.';
      return null;
    }
    const year = await FinancialYear.findById(found.financialYear).session(session);
    if (!year || year.status !== 'open') {
      errorStatus = 409;
      errorMessage = 'The journal entry financial year is not open.';
      return null;
    }
    const linesError = validateJournalLines(found.lines);
    if (linesError) {
      errorStatus = 409;
      errorMessage = linesError;
      return null;
    }
    const accountIds = [...new Set(found.lines.map((line) => String(line.account)))];
    const accounts = await FinancialAccount.find({ _id: { $in: accountIds }, active: true }).session(session);
    if (accounts.length !== accountIds.length || accounts.some((account) => account.currency !== found.currency)) {
      errorStatus = 409;
      errorMessage = 'One or more journal accounts are no longer active or use another currency.';
      return null;
    }
    const compositionError = validateJournalComposition(found.sourceType, found.lines, accounts);
    if (compositionError) {
      errorStatus = 409;
      errorMessage = compositionError;
      return null;
    }
    await touchFinancialYear(year, session);
    found.status = 'posted';
    found.approvedBy = req.user._id;
    found.postedAt = new Date();
    await found.save({ session });
    await audit(req.user, 'journal_entry.posted', 'journal_entry', found._id, { reference: found.reference }, '', session);
    return found;
  });
  if (errorStatus) return res.status(errorStatus).json({ message: errorMessage });
  return res.json({ entry });
});

router.get('/reports', async (req, res) => {
  if (!mongoose.isValidObjectId(req.query.yearId)) return res.status(400).json({ message: 'Select a valid financial year.' });
  const hasMonth = req.query.month !== undefined;
  const hasDate = req.query.date !== undefined;
  const hasRange = req.query.from !== undefined || req.query.to !== undefined;
  if (Number(hasMonth) + Number(hasDate) + Number(hasRange) > 1) {
    return res.status(400).json({ message: 'Choose a full year, month, day, or custom date range.' });
  }
  const month = hasMonth ? Number(req.query.month) : undefined;
  if (hasMonth && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return res.status(400).json({ message: 'Reporting month must be between 1 and 12.' });
  }
  if (hasDate && !isDateOnly(req.query.date)) {
    return res.status(400).json({ message: 'Report date must be a valid date in YYYY-MM-DD format.' });
  }
  if (hasRange && (!isDateOnly(req.query.from) || !isDateOnly(req.query.to) || req.query.from > req.query.to)) {
    return res.status(400).json({ message: 'Provide a valid date range using YYYY-MM-DD dates, with the start on or before the end.' });
  }
  let notFound = false;
  let outsideYear = false;
  let currencyMismatch = false;
  const report = await withTransaction(async (session) => {
    const year = await FinancialYear.findById(req.query.yearId).session(session).lean();
    if (!year) {
      notFound = true;
      return null;
    }
    let period = yearDates(year, month);
    if (hasDate) {
      const start = new Date(`${req.query.date}T00:00:00.000Z`);
      period = { start, end: new Date(`${req.query.date}T23:59:59.999Z`) };
    } else if (hasRange) {
      period = {
        start: new Date(`${req.query.from}T00:00:00.000Z`),
        end: new Date(`${req.query.to}T23:59:59.999Z`),
      };
    }
    if (!period) {
      outsideYear = true;
      return null;
    }
    if (period.start < year.startDate || period.end > year.endDate) {
      outsideYear = true;
      return null;
    }
    const accounts = await FinancialAccount.find().session(session).lean();
    const entries = await JournalEntry.find({
      status: 'posted',
      entryDate: { $lte: period.end },
    }).session(session).lean();
    if (accounts.some((account) => account.currency !== req.app.locals.accountingCurrency)
      || entries.some((entry) => entry.currency !== req.app.locals.accountingCurrency)) {
      currencyMismatch = true;
      return null;
    }
    const periodEntries = entries.filter((entry) => (
      entry.financialYear.equals(year._id)
      && entry.entryDate >= period.start
      && entry.entryDate <= period.end
    ));
    const ytdEntries = entries.filter((entry) => (
      entry.financialYear.equals(year._id)
      && entry.entryDate >= year.startDate
      && entry.entryDate <= period.end
    ));
    const openingEntries = entries.filter((entry) => entry.entryDate < period.start);
    const opening = summarizePostedEntries(openingEntries, accounts);
    const current = summarizePostedEntries(periodEntries, accounts);
    const yearToDate = summarizePostedEntries(ytdEntries, accounts);
    const openingBalances = new Map(opening.accounts.map((account) => [account.accountId, account]));
    const periodBalances = new Map(current.accounts.map((account) => [account.accountId, account]));
    const cashAndBankAccounts = accounts
      .filter((account) => account.cashOrBank)
      .map((account) => {
        const openingMinor = openingBalances.get(String(account._id));
        const periodMinor = periodBalances.get(String(account._id));
        const openingBalanceMinor = openingMinor
          ? openingMinor.balanceMinor
          : accountBalanceMinor(account.type, 0, 0);
        const movementMinor = periodMinor ? periodMinor.balanceMinor : 0;
        return {
          accountId: String(account._id),
          code: account.code,
          name: account.name,
          openingBalanceMinor,
          movementMinor,
          closingBalanceMinor: safeAdd(openingBalanceMinor, movementMinor),
        };
      });
    const isAnnual = !hasMonth && !hasDate && !hasRange;
    const monthlyTrend = [];
    let comparison = null;

    if (isAnnual) {
      for (let monthIndex = 1; monthIndex <= 12; monthIndex += 1) {
        const dates = yearDates(year, monthIndex);
        if (!dates) continue;
        const monthEntries = ytdEntries.filter((entry) => (
          entry.entryDate >= dates.start && entry.entryDate <= dates.end
        ));
        const summary = summarizePostedEntries(monthEntries, accounts);
        monthlyTrend.push({
          month: monthIndex,
          startDate: dates.start.toISOString().slice(0, 10),
          endDate: dates.end.toISOString().slice(0, 10),
          incomeMinor: summary.incomeMinor,
          expensesMinor: summary.expensesMinor,
        });
      }
      const previousYearNumber = year.startDate.getUTCFullYear() - 1;
      const previousYear = await FinancialYear.findOne({
        startDate: new Date(Date.UTC(previousYearNumber, 0, 1)),
        endDate: new Date(Date.UTC(previousYearNumber, 11, 31, 23, 59, 59, 999)),
      }).session(session).lean();
      if (previousYear) {
        const previousEntries = entries.filter((entry) => entry.financialYear.equals(previousYear._id));
        const previous = summarizePostedEntries(previousEntries, accounts);
        const change = (currentValue, previousValue) => {
          if (previousValue === 0) return { amountMinor: currentValue, percent: null };
          const amountMinor = safeSubtract(currentValue, previousValue);
          return {
            amountMinor,
            percent: Math.round((amountMinor / Math.abs(previousValue)) * 10_000) / 100,
          };
        };
        comparison = {
          year: serializeYear(previousYear),
          incomeMinor: previous.incomeMinor,
          expensesMinor: previous.expensesMinor,
          netSurplusMinor: previous.netSurplusMinor,
          change: {
            income: change(yearToDate.incomeMinor, previous.incomeMinor),
            expenses: change(yearToDate.expensesMinor, previous.expensesMinor),
            netSurplus: change(yearToDate.netSurplusMinor, previous.netSurplusMinor),
          },
        };
      }
    }

    return {
      basis: 'accrual_double_entry',
      currency: req.app.locals.accountingCurrency,
      minorUnitDigits: req.app.locals.accountingCurrencyDigits,
      year: serializeYear(year),
      period: {
        id: hasMonth
          ? `${year.startDate.getUTCFullYear()}-${String(month).padStart(2, '0')}`
          : hasDate
            ? req.query.date
            : hasRange
              ? `${req.query.from}..${req.query.to}`
              : `FY-${year.startDate.getUTCFullYear()}`,
        startDate: period.start.toISOString().slice(0, 10),
        endDate: period.end.toISOString().slice(0, 10),
        month: month ?? null,
        date: hasDate ? req.query.date : null,
      },
      opening: { cashAndBankMinor: opening.cashBankMinor },
      current: {
        incomeMinor: current.incomeMinor,
        expensesMinor: current.expensesMinor,
        netSurplusMinor: current.netSurplusMinor,
        cashAndBankMovementMinor: current.cashBankMinor,
        cashAndBankClosingMinor: safeAdd(opening.cashBankMinor, current.cashBankMinor),
        cashAndBankAccounts,
        accountBalances: current.accounts,
      },
      yearToDate: {
        incomeMinor: yearToDate.incomeMinor,
        expensesMinor: yearToDate.expensesMinor,
        netSurplusMinor: yearToDate.netSurplusMinor,
      },
      monthlyTrend: isAnnual ? monthlyTrend : undefined,
      comparison,
      recordsIncluded: periodEntries.length,
    };
  });
  if (notFound) return res.status(404).json({ message: 'Financial year not found.' });
  if (outsideYear) return res.status(400).json({ message: 'The selected month is outside the financial year dates.' });
  if (currencyMismatch) {
    return res.status(409).json({
      message: 'The configured base currency differs from existing ledger data. Restore the original currency or perform an approved migration.',
    });
  }
  return res.json(report);
});

router.get('/audit-log', requireRoles('director'), async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const [events, total] = await Promise.all([
    FinancialAuditLog.find().populate('actor', 'name email role').sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    FinancialAuditLog.countDocuments(),
  ]);
  return res.json({ events, page, limit, total });
});

module.exports = { router, STANDARD_ACCOUNTS };
