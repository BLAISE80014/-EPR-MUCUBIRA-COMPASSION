const mongoose = require('mongoose');

const financialYearGuardSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  revision: { type: Number, required: true, default: 0 },
}, { versionKey: false });

module.exports = mongoose.model('FinancialYearGuard', financialYearGuardSchema);
