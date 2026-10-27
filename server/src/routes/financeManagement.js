const express = require('express');
const mongoose = require('mongoose');
const EmployeePerformance = require('../models/EmployeePerformance');
const FinancialAuditLog = require('../models/FinancialAuditLog');
const JournalEntry = require('../models/JournalEntry');
const OrganizationalAsset = require('../models/OrganizationalAsset');
const OrganizationalProject = require('../models/OrganizationalProject');
const User = require('../models/User');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
const FINANCE_ROLES = ['accountant', 'director'];
const ASSET_STATUSES = new Set(['active', 'inactive', 'maintenance', 'disposed']);
const ASSET_SOURCES = new Set(['donor', 'donation', 'purchase', 'grant', 'other']);
const PROJECT_STATUSES = new Set(['planned', 'in_progress', 'completed', 'on_hold', 'cancelled']);
const PROJECT_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

router.use(requireAuth, requireRoles(...FINANCE_ROLES));

function isDateOnly(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function date(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function validAmount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function safeTotalAdd(total, amount) {
  const result = BigInt(total) + BigInt(amount);
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError('A financial total exceeds the supported safe integer range.');
  }
  return Number(result);
}

function validLink(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assetInput(body, currency) {
  const fields = {
    assetCode: typeof body.assetCode === 'string' ? body.assetCode.trim().toUpperCase() : '',
    name: typeof body.name === 'string' ? body.name.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    condition: typeof body.condition === 'string' ? body.condition.trim() : '',
    category: typeof body.category === 'string' ? body.category.trim() : '',
    acquisitionValueMinor: body.acquisitionValueMinor,
    acquisitionDate: body.acquisitionDate,
    endOfUseDate: body.endOfUseDate || null,
    depreciationMethod: body.depreciationMethod || 'none',
    usefulLifeMonths: body.usefulLifeMonths ?? 1,
    salvageValueMinor: body.salvageValueMinor ?? 0,
    source: body.source,
    donorOrSupplier: typeof body.donorOrSupplier === 'string' ? body.donorOrSupplier.trim() : '',
    location: typeof body.location === 'string' ? body.location.trim() : '',
    photoUrl: typeof body.photoUrl === 'string' ? body.photoUrl.trim() : '',
    supportingDocumentUrl: typeof body.supportingDocumentUrl === 'string' ? body.supportingDocumentUrl.trim() : '',
    department: typeof body.department === 'string' ? body.department.trim() : '',
    responsibleEmployee: body.responsibleEmployee || null,
    status: body.status || 'active',
    notes: typeof body.notes === 'string' ? body.notes.trim() : '',
  };
  if (!/^[A-Z0-9_-]{2,40}$/.test(fields.assetCode)) return { error: 'Asset code must be 2-40 letters, numbers, hyphens, or underscores.' };
  if (fields.name.length < 2 || fields.name.length > 120) return { error: 'Asset name must be between 2 and 120 characters.' };
  if (!validAmount(fields.acquisitionValueMinor)) return { error: 'Enter the asset value as a non-negative whole number of RWF minor units.' };
  if (!isDateOnly(fields.acquisitionDate)) return { error: 'Enter a valid acquisition date in YYYY-MM-DD format.' };
  if (fields.endOfUseDate && (!isDateOnly(fields.endOfUseDate) || fields.endOfUseDate < fields.acquisitionDate)) {
    return { error: 'Expected end-of-use date must be on or after the acquisition date.' };
  }
  if (!ASSET_SOURCES.has(fields.source)) return { error: 'Choose a valid asset source.' };
  if (!ASSET_STATUSES.has(fields.status)) return { error: 'Choose a valid asset status.' };
  if (!['none', 'straight_line'].includes(fields.depreciationMethod)) return { error: 'Choose a supported depreciation method.' };
  if (!Number.isSafeInteger(fields.usefulLifeMonths) || fields.usefulLifeMonths < 1 || fields.usefulLifeMonths > 1200) return { error: 'Useful life must be between 1 and 1200 months.' };
  if (!validAmount(fields.salvageValueMinor) || fields.salvageValueMinor > fields.acquisitionValueMinor) return { error: 'Salvage value must be between zero and the acquisition value.' };
  if (fields.depreciationMethod === 'none' && fields.salvageValueMinor > 0) return { error: 'Salvage value requires straight-line depreciation.' };
  if (!validLink(fields.photoUrl) || !validLink(fields.supportingDocumentUrl)) return { error: 'Asset photos and documents must be valid HTTP or HTTPS links.' };
  for (const [field, max] of Object.entries({ description: 1000, condition: 120, category: 80, donorOrSupplier: 120, location: 160, department: 80, notes: 1000 })) {
    if (fields[field].length > max) return { error: `${field} must be ${max} characters or fewer.` };
  }
  if (fields.responsibleEmployee && !mongoose.isValidObjectId(fields.responsibleEmployee)) return { error: 'Select a valid responsible employee.' };
  fields.acquisitionDate = date(fields.acquisitionDate);
  fields.endOfUseDate = fields.endOfUseDate ? date(fields.endOfUseDate) : null;
  fields.currency = currency;
  return { fields };
}

function projectInput(body, currency) {
  const fields = {
    projectCode: typeof body.projectCode === 'string' ? body.projectCode.trim().toUpperCase() : '',
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    expectedResults: typeof body.expectedResults === 'string' ? body.expectedResults.trim() : '',
    responsibleEmployee: body.responsibleEmployee || null,
    responsibleTeam: typeof body.responsibleTeam === 'string' ? body.responsibleTeam.trim() : '',
    startDate: body.startDate,
    deadline: body.deadline,
    timeframe: typeof body.timeframe === 'string' ? body.timeframe.trim() : '',
    estimatedBudgetMinor: body.estimatedBudgetMinor ?? 0,
    approvedBudgetMinor: body.approvedBudgetMinor ?? 0,
    fundingSource: typeof body.fundingSource === 'string' ? body.fundingSource.trim() : '',
    category: typeof body.category === 'string' ? body.category.trim() : '',
    priority: body.priority || 'normal',
    status: body.status || 'planned',
    notes: typeof body.notes === 'string' ? body.notes.trim() : '',
  };
  if (!/^[A-Z0-9_-]{2,40}$/.test(fields.projectCode)) return { error: 'Project code must be 2-40 letters, numbers, hyphens, or underscores.' };
  if (fields.title.length < 3 || fields.title.length > 160) return { error: 'Project title must be between 3 and 160 characters.' };
  if (!isDateOnly(fields.startDate) || !isDateOnly(fields.deadline) || fields.startDate > fields.deadline) return { error: 'Choose valid project dates with the deadline on or after the start date.' };
  if (!validAmount(fields.estimatedBudgetMinor) || !validAmount(fields.approvedBudgetMinor)) return { error: 'Project budgets must be non-negative whole RWF minor units.' };
  if (!PROJECT_STATUSES.has(fields.status) || !PROJECT_PRIORITIES.has(fields.priority)) return { error: 'Choose a valid project status and priority.' };
  for (const [field, max] of Object.entries({ description: 1500, expectedResults: 1500, timeframe: 80, responsibleTeam: 160, fundingSource: 160, category: 80, notes: 1500 })) {
    if (fields[field].length > max) return { error: `${field} must be ${max} characters or fewer.` };
  }
  if (fields.responsibleEmployee && !mongoose.isValidObjectId(fields.responsibleEmployee)) return { error: 'Select a valid responsible employee.' };
  fields.startDate = date(fields.startDate);
  fields.deadline = date(fields.deadline);
  fields.currency = currency;
  return { fields };
}

async function audit(actor, action, resourceType, resourceId, details, session) {
  await FinancialAuditLog.create([{
    actor: actor._id,
    action,
    resourceType,
    resourceId,
    details,
  }], { session });
}

function assetDepreciation(asset, asOf) {
  if (asset.depreciationMethod !== 'straight_line') {
    return { depreciationToDateMinor: 0, bookValueMinor: asset.acquisitionValueMinor };
  }
  const start = asset.acquisitionDate;
  const months = Math.max(0, Math.min(
    asset.usefulLifeMonths,
    (asOf.getUTCFullYear() - start.getUTCFullYear()) * 12 + (asOf.getUTCMonth() - start.getUTCMonth()) + 1,
  ));
  const depreciable = BigInt(asset.acquisitionValueMinor - asset.salvageValueMinor);
  const accumulated = Number((depreciable * BigInt(months)) / BigInt(asset.usefulLifeMonths));
  const depreciationToDateMinor = Math.min(asset.acquisitionValueMinor - asset.salvageValueMinor, accumulated);
  return {
    depreciationToDateMinor,
    bookValueMinor: asset.acquisitionValueMinor - depreciationToDateMinor,
  };
}

router.get('/assets', async (req, res) => {
  const filter = {};
  if (req.query.status) {
    if (!ASSET_STATUSES.has(req.query.status)) return res.status(400).json({ message: 'Asset status filter is invalid.' });
    filter.status = req.query.status;
  }
  if (typeof req.query.category === 'string' && req.query.category.trim()) filter.category = req.query.category.trim().slice(0, 80);
  if (typeof req.query.location === 'string' && req.query.location.trim()) filter.location = new RegExp(req.query.location.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (req.query.from || req.query.to) {
    filter.acquisitionDate = {};
    if (req.query.from) {
      if (!isDateOnly(req.query.from)) return res.status(400).json({ message: 'Asset start date filter is invalid.' });
      filter.acquisitionDate.$gte = date(req.query.from);
    }
    if (req.query.to) {
      if (!isDateOnly(req.query.to)) return res.status(400).json({ message: 'Asset end date filter is invalid.' });
      filter.acquisitionDate.$lte = date(req.query.to);
    }
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const term = req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ assetCode: new RegExp(term, 'i') }, { name: new RegExp(term, 'i') }, { donorOrSupplier: new RegExp(term, 'i') }];
  }
  const assets = await OrganizationalAsset.find(filter)
    .populate('responsibleEmployee', 'name department')
    .sort({ acquisitionDate: -1 })
    .lean();
  const asOf = req.query.asOf && isDateOnly(req.query.asOf) ? date(req.query.asOf) : new Date();
  const serialized = assets.map((asset) => ({
    ...asset,
    ...assetDepreciation(asset, asOf),
  }));
  const totals = serialized.reduce((result, asset) => {
    result.acquisitionValueMinor = safeTotalAdd(result.acquisitionValueMinor, asset.acquisitionValueMinor);
    result.bookValueMinor = safeTotalAdd(result.bookValueMinor, asset.bookValueMinor);
    result.count = safeTotalAdd(result.count, 1);
    result.byStatus[asset.status] = (result.byStatus[asset.status] || 0) + 1;
    return result;
  }, { acquisitionValueMinor: 0, bookValueMinor: 0, count: 0, byStatus: {} });
  return res.json({ assets: serialized, totals, currency: req.app.locals.accountingCurrency });
});

router.post('/assets', requireRoles('accountant'), async (req, res) => {
  const parsed = assetInput(req.body || {}, req.app.locals.accountingCurrency);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const session = await mongoose.startSession();
  let asset;
  let error;
  try {
    await session.withTransaction(async () => {
      if (parsed.fields.responsibleEmployee && !(await User.exists({ _id: parsed.fields.responsibleEmployee, active: true }).session(session))) {
        error = { status: 400, message: 'Select an active organization employee.' };
        return;
      }
      const [created] = await OrganizationalAsset.create([{
        ...parsed.fields,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        statusHistory: [{ from: 'new', to: parsed.fields.status, changedBy: req.user._id, note: 'Asset registered.' }],
      }], { session });
      await audit(req.user, 'asset.created', 'organizational_asset', created._id, {
        assetCode: created.assetCode,
        acquisitionValueMinor: created.acquisitionValueMinor,
        status: created.status,
      }, session);
      asset = created;
    });
  } finally {
    await session.endSession();
  }
  if (error) return res.status(error.status).json({ message: error.message });
  return res.status(201).json({ asset });
});

router.patch('/assets/:id', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Asset identifier is invalid.' });
  const parsed = assetInput(req.body || {}, req.app.locals.accountingCurrency);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const session = await mongoose.startSession();
  let asset;
  let error;
  try {
    await session.withTransaction(async () => {
      const found = await OrganizationalAsset.findById(req.params.id).session(session);
      if (!found) {
        error = { status: 404, message: 'Asset not found.' };
        return;
      }
      if (parsed.fields.responsibleEmployee && !(await User.exists({ _id: parsed.fields.responsibleEmployee, active: true }).session(session))) {
        error = { status: 400, message: 'Select an active organization employee.' };
        return;
      }
      const before = found.toObject();
      const oldStatus = found.status;
      Object.assign(found, parsed.fields, { updatedBy: req.user._id });
      if (oldStatus !== found.status) {
        found.statusHistory.push({
          from: oldStatus,
          to: found.status,
          changedBy: req.user._id,
          changedAt: new Date(),
          note: typeof req.body.statusNote === 'string' ? req.body.statusNote.trim().slice(0, 500) : '',
        });
      }
      await found.save({ session });
      await audit(req.user, 'asset.updated', 'organizational_asset', found._id, {
        before: {
          assetCode: before.assetCode,
          status: oldStatus,
          acquisitionValueMinor: before.acquisitionValueMinor,
          location: before.location,
        },
        after: {
          assetCode: found.assetCode,
          status: found.status,
          acquisitionValueMinor: found.acquisitionValueMinor,
          location: found.location,
        },
      }, session);
      asset = found;
    });
  } finally {
    await session.endSession();
  }
  if (error) return res.status(error.status).json({ message: error.message });
  return res.json({ asset });
});

router.delete('/assets/:id', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Asset identifier is invalid.' });
  const session = await mongoose.startSession();
  let deleted = false;
  try {
    await session.withTransaction(async () => {
      const asset = await OrganizationalAsset.findById(req.params.id).session(session);
      if (!asset) return;
      await audit(req.user, 'asset.deleted', 'organizational_asset', asset._id, {
        assetCode: asset.assetCode,
        name: asset.name,
        acquisitionValueMinor: asset.acquisitionValueMinor,
      }, session);
      await asset.deleteOne({ session });
      deleted = true;
    });
  } finally {
    await session.endSession();
  }
  if (!deleted) return res.status(404).json({ message: 'Asset not found.' });
  return res.json({ deleted: true });
});

router.post('/assets/:id/maintenance', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Asset identifier is invalid.' });
  if (!isDateOnly(req.body?.date) || typeof req.body?.description !== 'string' || req.body.description.trim().length < 3
    || req.body.description.trim().length > 500 || !validAmount(req.body?.costMinor ?? 0)) {
    return res.status(400).json({ message: 'Provide a valid maintenance date, description, and non-negative RWF amount.' });
  }
  const session = await mongoose.startSession();
  let asset;
  try {
    await session.withTransaction(async () => {
      asset = await OrganizationalAsset.findById(req.params.id).session(session);
      if (!asset) return;
      asset.maintenanceHistory.push({
        date: date(req.body.date),
        description: req.body.description.trim(),
        costMinor: req.body.costMinor ?? 0,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '',
        recordedBy: req.user._id,
      });
      asset.updatedBy = req.user._id;
      await asset.save({ session });
      await audit(req.user, 'asset.maintenance_recorded', 'organizational_asset', asset._id, {
        costMinor: req.body.costMinor ?? 0,
      }, session);
    });
  } finally {
    await session.endSession();
  }
  if (!asset) return res.status(404).json({ message: 'Asset not found.' });
  return res.status(201).json({ asset });
});

async function projectExpenditure(projects) {
  if (!projects.length) return new Map();
  const byCode = new Map(projects.map((project) => [project.projectCode, 0]));
  const entries = await JournalEntry.find({
    status: 'posted',
    projectReference: { $in: [...byCode.keys()] },
  }).populate('lines.account', 'type').lean();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.account?.type !== 'expense') continue;
      const expenseMinor = BigInt(line.debitMinor) - BigInt(line.creditMinor);
      const amount = BigInt(byCode.get(entry.projectReference) || 0) + expenseMinor;
      if (amount > BigInt(Number.MAX_SAFE_INTEGER) || amount < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new RangeError('Project expenditure exceeds the supported safe integer range.');
      }
      byCode.set(entry.projectReference, Number(amount));
    }
  }
  return byCode;
}

router.get('/projects', async (req, res) => {
  const filter = {};
  if (req.query.status) {
    if (!PROJECT_STATUSES.has(req.query.status)) return res.status(400).json({ message: 'Project status filter is invalid.' });
    filter.status = req.query.status;
  }
  if (req.query.year) {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ message: 'Project report year is invalid.' });
    filter.startDate = { $lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
    filter.deadline = { $gte: new Date(Date.UTC(year, 0, 1)) };
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const term = req.query.search.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: new RegExp(term, 'i') }, { projectCode: new RegExp(term, 'i') }];
  }
  const projects = await OrganizationalProject.find(filter)
    .populate('responsibleEmployee', 'name department')
    .sort({ deadline: 1 })
    .lean();
  const expenditure = await projectExpenditure(projects);
  const withBudgets = projects.map((project) => {
    const actualExpenditureMinor = expenditure.get(project.projectCode) || 0;
    return {
      ...project,
      actualExpenditureMinor,
      remainingBudgetMinor: project.approvedBudgetMinor - actualExpenditureMinor,
      utilizationPercent: project.approvedBudgetMinor > 0
        ? Math.round((actualExpenditureMinor / project.approvedBudgetMinor) * 1000) / 10
        : null,
      overBudget: actualExpenditureMinor > project.approvedBudgetMinor,
      overdue: project.status !== 'completed' && project.status !== 'cancelled' && project.deadline < new Date(),
    };
  });
  const totals = withBudgets.reduce((result, project) => {
    result.approvedBudgetMinor = safeTotalAdd(result.approvedBudgetMinor, project.approvedBudgetMinor);
    result.actualExpenditureMinor = safeTotalAdd(result.actualExpenditureMinor, project.actualExpenditureMinor);
    result.remainingBudgetMinor = safeTotalAdd(result.remainingBudgetMinor, project.remainingBudgetMinor);
    result.count = safeTotalAdd(result.count, 1);
    if (project.overBudget) result.overBudgetCount += 1;
    if (project.overdue) result.overdueCount += 1;
    return result;
  }, { approvedBudgetMinor: 0, actualExpenditureMinor: 0, remainingBudgetMinor: 0, count: 0, overBudgetCount: 0, overdueCount: 0 });
  return res.json({ projects: withBudgets, totals, currency: req.app.locals.accountingCurrency });
});

router.post('/projects', requireRoles('accountant'), async (req, res) => {
  const parsed = projectInput(req.body || {}, req.app.locals.accountingCurrency);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const session = await mongoose.startSession();
  let project;
  let error;
  try {
    await session.withTransaction(async () => {
      if (parsed.fields.responsibleEmployee && !(await User.exists({ _id: parsed.fields.responsibleEmployee, active: true }).session(session))) {
        error = { status: 400, message: 'Select an active organization employee.' };
        return;
      }
      const [created] = await OrganizationalProject.create([{
        ...parsed.fields,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      }], { session });
      await audit(req.user, 'project.created', 'organizational_project', created._id, {
        projectCode: created.projectCode,
        approvedBudgetMinor: created.approvedBudgetMinor,
      }, session);
      project = created;
    });
  } finally {
    await session.endSession();
  }
  if (error) return res.status(error.status).json({ message: error.message });
  return res.status(201).json({ project });
});

router.patch('/projects/:id', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Project identifier is invalid.' });
  const parsed = projectInput(req.body || {}, req.app.locals.accountingCurrency);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const session = await mongoose.startSession();
  let project;
  let error;
  try {
    await session.withTransaction(async () => {
      const found = await OrganizationalProject.findById(req.params.id).session(session);
      if (!found) {
        error = { status: 404, message: 'Project not found.' };
        return;
      }
      if (parsed.fields.responsibleEmployee && !(await User.exists({ _id: parsed.fields.responsibleEmployee, active: true }).session(session))) {
        error = { status: 400, message: 'Select an active organization employee.' };
        return;
      }
      const before = {
        projectCode: found.projectCode,
        approvedBudgetMinor: found.approvedBudgetMinor,
        status: found.status,
      };
      Object.assign(found, parsed.fields, { updatedBy: req.user._id });
      await found.save({ session });
      await audit(req.user, 'project.updated', 'organizational_project', found._id, {
        before,
        after: {
          projectCode: found.projectCode,
          approvedBudgetMinor: found.approvedBudgetMinor,
          status: found.status,
        },
      }, session);
      project = found;
    });
  } finally {
    await session.endSession();
  }
  if (error) return res.status(error.status).json({ message: error.message });
  return res.json({ project });
});

router.delete('/projects/:id', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Project identifier is invalid.' });
  const session = await mongoose.startSession();
  let deleted = false;
  try {
    await session.withTransaction(async () => {
      const project = await OrganizationalProject.findById(req.params.id).session(session);
      if (!project) return;
      const linkedPostedEntries = await JournalEntry.countDocuments({
        status: 'posted',
        projectReference: project.projectCode,
      }).session(session);
      if (linkedPostedEntries > 0) return;
      await audit(req.user, 'project.deleted', 'organizational_project', project._id, {
        projectCode: project.projectCode,
        title: project.title,
        approvedBudgetMinor: project.approvedBudgetMinor,
        status: project.status,
      }, session);
      await project.deleteOne({ session });
      deleted = true;
    });
  } finally {
    await session.endSession();
  }
  if (!deleted) {
    const project = await OrganizationalProject.findById(req.params.id).select('projectCode').lean();
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    const linkedPostedEntries = await JournalEntry.countDocuments({
      status: 'posted',
      projectReference: project.projectCode,
    });
    if (linkedPostedEntries > 0) {
      return res.status(409).json({ message: 'This project has posted expenses linked to it. Mark it completed or cancelled instead of deleting it.' });
    }
    return res.status(404).json({ message: 'Project not found.' });
  }
  return res.json({ deleted: true });
});

router.get('/performance', async (req, res) => {
  const filter = {};
  if (req.query.year !== undefined) {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ message: 'Performance report year is invalid.' });
    filter.year = year;
  }
  if (req.query.month !== undefined) {
    const month = Number(req.query.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ message: 'Performance report month must be between 1 and 12.' });
    filter.month = month;
  }
  if (req.query.employeeId) {
    if (!mongoose.isValidObjectId(req.query.employeeId)) return res.status(400).json({ message: 'Employee identifier is invalid.' });
    filter.employee = req.query.employeeId;
  }
  const records = await EmployeePerformance.find(filter)
    .populate('employee', 'name department role active')
    .populate('reviewer', 'name')
    .sort({ year: -1, month: -1, employee: 1 })
    .lean();
  return res.json({
    records: records.map((record) => ({
      ...record,
      achievementPercent: record.target > 0 ? Math.round((record.actual / record.target) * 1000) / 10 : null,
    })),
    total: records.length,
    currency: req.app.locals.accountingCurrency,
  });
});

router.put('/performance/:employeeId/:year/:month', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.employeeId)) return res.status(400).json({ message: 'Employee identifier is invalid.' });
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  const { target, actual, salesCount = 0, salesValueMinor = 0, title = '', workCompleted = '', notes = '' } = req.body || {};
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ message: 'Choose a valid performance month and year.' });
  }
  if (![target, actual].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    return res.status(400).json({ message: 'Target and actual achievement must be non-negative numbers.' });
  }
  if (!Number.isSafeInteger(salesCount) || salesCount < 0 || !validAmount(salesValueMinor)) {
    return res.status(400).json({ message: 'Sales count and sales value must be non-negative whole numbers.' });
  }
  if (typeof workCompleted !== 'string' || workCompleted.length > 1500 || typeof notes !== 'string' || notes.length > 1500) {
    return res.status(400).json({ message: 'Performance notes must be 1500 characters or fewer.' });
  }
  if (typeof title !== 'string' || title.trim().length > 120) {
    return res.status(400).json({ message: 'Employee title must be 120 characters or fewer.' });
  }
  const session = await mongoose.startSession();
  let record;
  let error;
  try {
    await session.withTransaction(async () => {
      const employee = await User.findOne({
        _id: req.params.employeeId,
        active: true,
        role: { $nin: ['pending', 'parent', 'member'] },
      }).session(session);
      if (!employee) {
        error = { status: 404, message: 'Active organization employee not found.' };
        return;
      }
      const beforeRecord = await EmployeePerformance.findOne({ employee: employee._id, year, month }).session(session).lean();
      record = await EmployeePerformance.findOneAndUpdate(
        { employee: employee._id, year, month },
        {
          $set: {
            target,
            actual,
            salesCount,
            salesValueMinor,
            title: title.trim(),
            currency: req.app.locals.accountingCurrency,
            workCompleted: workCompleted.trim(),
            notes: notes.trim(),
            reviewer: req.user._id,
            reviewedAt: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true, session, setDefaultsOnInsert: true },
      );
      await audit(req.user, beforeRecord ? 'employee_performance.updated' : 'employee_performance.created', 'employee_performance', record._id, {
        employee: String(employee._id),
        year,
        month,
        before: beforeRecord ? { target: beforeRecord.target, actual: beforeRecord.actual, salesCount: beforeRecord.salesCount, salesValueMinor: beforeRecord.salesValueMinor } : null,
        after: { title: title.trim(), target, actual, salesCount, salesValueMinor },
      }, session);
    });
  } finally {
    await session.endSession();
  }
  if (error) return res.status(error.status).json({ message: error.message });
  return res.status(201).json({
    record,
    achievementPercent: record.target > 0 ? Math.round((record.actual / record.target) * 1000) / 10 : null,
  });
});

router.delete('/performance/:id', requireRoles('accountant'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Performance record identifier is invalid.' });
  const session = await mongoose.startSession();
  let deleted = false;
  try {
    await session.withTransaction(async () => {
      const record = await EmployeePerformance.findById(req.params.id).session(session);
      if (!record) return;
      await audit(req.user, 'employee_performance.deleted', 'employee_performance', record._id, {
        employee: String(record.employee),
        title: record.title,
        year: record.year,
        month: record.month,
        salesCount: record.salesCount,
        salesValueMinor: record.salesValueMinor,
      }, session);
      await record.deleteOne({ session });
      deleted = true;
    });
  } finally {
    await session.endSession();
  }
  if (!deleted) return res.status(404).json({ message: 'Performance record not found.' });
  return res.json({ deleted: true });
});

module.exports = router;
