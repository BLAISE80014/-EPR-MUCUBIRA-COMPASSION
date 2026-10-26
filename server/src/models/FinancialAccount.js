const mongoose = require('mongoose');

const financialAccountSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  type: {
    type: String,
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense'],
    required: true,
  },
  cashOrBank: { type: Boolean, default: false },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

financialAccountSchema.index({ code: 1 }, { unique: true });
financialAccountSchema.index({ type: 1, active: 1 });
financialAccountSchema.index({ cashOrBank: 1, active: 1 });

module.exports = mongoose.model('FinancialAccount', financialAccountSchema);
