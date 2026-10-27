const mongoose = require('mongoose');

const organizationalProjectSchema = new mongoose.Schema({
  projectCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40, unique: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1500, default: '' },
  expectedResults: { type: String, trim: true, maxlength: 1500, default: '' },
  responsibleEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  responsibleTeam: { type: String, trim: true, maxlength: 160, default: '' },
  startDate: { type: Date, required: true },
  deadline: { type: Date, required: true },
  timeframe: { type: String, trim: true, maxlength: 80, default: '' },
  estimatedBudgetMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  approvedBudgetMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  currency: { type: String, required: true, enum: ['RWF'] },
  fundingSource: { type: String, trim: true, maxlength: 160, default: '' },
  category: { type: String, trim: true, maxlength: 80, default: '' },
  priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
  status: { type: String, enum: ['planned', 'in_progress', 'completed', 'on_hold', 'cancelled'], default: 'planned' },
  notes: { type: String, trim: true, maxlength: 1500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

organizationalProjectSchema.index({ status: 1, deadline: 1 });
organizationalProjectSchema.index({ startDate: 1, deadline: 1 });

module.exports = mongoose.model('OrganizationalProject', organizationalProjectSchema);
