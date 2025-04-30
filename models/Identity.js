const mongoose = require('mongoose');

const IdentitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  authType: {
    type: String,
    enum: ['password', 'key'],
    default: 'password'
  },
  password: {
    type: String,
    required: false,
    trim: true
  },
  privateKey: {
    type: String,
    required: false
  },
  keyPassphrase: {
    type: String,
    required: false,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Identity', IdentitySchema); 