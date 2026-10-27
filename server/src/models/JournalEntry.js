const mongoose = require('mongoose');

const journalLineSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialAccount', required: true },
  debitMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  creditMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  description: { type: String, trim: true, maxlength: 300, default: '' },
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  entryDate: { type: Date, required: true },
  financialYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  periodId: {
    type: String,
    required: true,
    match: /^\d{4}-(0[1-9]|1[0-2])$/,
  },
  description: { type: String, required: true, trim: true, minlength: 3, maxlength: 500 },
  sourceType: {
    type: String,
    enum: ['income', 'expense', 'transfer', 'adjustment', 'opening_balance', 'journal'],
    default: 'journal',
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'mobile_money', 'other', ''],
    default: '',
  },
  counterparty: { type: String, trim: true, maxlength: 120, default: '' },
  responsibleEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  projectReference: { type: String, trim: true, maxlength: 120, default: '' },
  supportingDocumentUrl: { type: String, trim: true, maxlength: 500, default: '' },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  lines: { type: [journalLineSchema], required: true, validate: (lines) => lines.length >= 2 && lines.length <= 30 },
  status: { type: String, enum: ['draft', 'submitted', 'posted'], default: 'draft', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date, default: null },
  reviewComment: { type: String, trim: true, maxlength: 500, default: '' },
  returnedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  postedAt: { type: Date, default: null },
}, { timestamps: true });

journalEntrySchema.index({ reference: 1 }, { unique: true });
journalEntrySchema.index({ reversalOf: 1 }, { unique: true, sparse: true });
journalEntrySchema.index({ financialYear: 1, periodId: 1, status: 1, entryDate: 1 });
journalEntrySchema.index({ status: 1, createdBy: 1 });
journalEntrySchema.index({ status: 1, entryDate: 1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
