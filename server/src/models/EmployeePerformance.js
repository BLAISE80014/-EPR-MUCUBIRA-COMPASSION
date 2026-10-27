const mongoose = require('mongoose');

const employeePerformanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  year: { type: Number, required: true, min: 2000, max: 2200 },
  month: { type: Number, required: true, min: 1, max: 12 },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  target: { type: Number, required: true, min: 0, validate: Number.isFinite },
  actual: { type: Number, required: true, min: 0, validate: Number.isFinite },
  salesCount: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  salesValueMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  currency: { type: String, required: true, enum: ['RWF'] },
  workCompleted: { type: String, trim: true, maxlength: 1500, default: '' },
  notes: { type: String, trim: true, maxlength: 1500, default: '' },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

employeePerformanceSchema.index({ employee: 1, year: -1, month: -1 }, { unique: true });
employeePerformanceSchema.index({ year: -1, month: -1 });

module.exports = mongoose.model('EmployeePerformance', employeePerformanceSchema);
