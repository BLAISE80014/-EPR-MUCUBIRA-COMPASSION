const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  costMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

const statusHistorySchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  note: { type: String, trim: true, maxlength: 500, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true, default: Date.now },
}, { _id: false });

const organizationalAssetSchema = new mongoose.Schema({
  assetCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40, unique: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  condition: { type: String, trim: true, maxlength: 120, default: '' },
  category: { type: String, trim: true, maxlength: 80, default: '' },
  acquisitionValueMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  depreciationMethod: { type: String, enum: ['none', 'straight_line'], default: 'none' },
  usefulLifeMonths: { type: Number, min: 1, validate: Number.isSafeInteger, default: 1 },
  salvageValueMinor: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
  currency: { type: String, required: true, enum: ['RWF'] },
  acquisitionDate: { type: Date, required: true },
  endOfUseDate: { type: Date, default: null },
  source: { type: String, required: true, enum: ['donor', 'donation', 'purchase', 'grant', 'other'] },
  donorOrSupplier: { type: String, trim: true, maxlength: 120, default: '' },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  photoUrl: { type: String, trim: true, maxlength: 500, default: '' },
  supportingDocumentUrl: { type: String, trim: true, maxlength: 500, default: '' },
  department: { type: String, trim: true, maxlength: 80, default: '' },
  responsibleEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, required: true, enum: ['active', 'inactive', 'maintenance', 'disposed'], default: 'active' },
  statusHistory: { type: [statusHistorySchema], default: [] },
  maintenanceHistory: { type: [maintenanceSchema], default: [] },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

organizationalAssetSchema.index({ status: 1, acquisitionDate: -1 });
organizationalAssetSchema.index({ category: 1, location: 1 });

module.exports = mongoose.model('OrganizationalAsset', organizationalAssetSchema);
