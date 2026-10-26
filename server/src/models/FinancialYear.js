const mongoose = require('mongoose');

const financialYearSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['open', 'closed'], default: 'open', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  closedAt: { type: Date, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reopenedAt: { type: Date, default: null },
  reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reopenReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

financialYearSchema.index({ startDate: 1, endDate: 1 });
financialYearSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('FinancialYear', financialYearSchema);
