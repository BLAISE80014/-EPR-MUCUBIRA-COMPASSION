const mongoose = require('mongoose');
const { DEPARTMENTS, ROLE_DEPARTMENTS } = require('../constants/roles');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    unique: true,
    index: true,
  },
  phone: {
    type: String,
    trim: true,
    maxlength: 32,
    default: '',
  },
  passwordHash: {
    type: String,
    required: true,
    select: false,
  },
  role: {
    type: String,
    enum: Object.keys(ROLE_DEPARTMENTS),
    required: true,
  },
  department: {
    type: String,
    enum: DEPARTMENTS,
    required: true,
  },
  groupIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SavingsGroup',
  }],
  active: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

userSchema.index({ department: 1, active: 1 });
userSchema.index({ role: 1, active: 1 });

module.exports = mongoose.model('User', userSchema);
