const mongoose = require('mongoose');

const financialAuditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true, trim: true, maxlength: 80 },
  resourceType: { type: String, required: true, trim: true, maxlength: 80 },
  resourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true });

financialAuditLogSchema.index({ resourceType:  1, resourceId: 1, createdAt: -1 });
financialAuditLogSchema.index({ createdAt: -1, actor: 1 });

module.exports = mongoose.model('FinancialAuditLog', financialAuditLogSchema);
