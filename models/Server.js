const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ServerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  host: {
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
  identityId: {
    type: Schema.Types.ObjectId,
    ref: 'Identity',
    required: false
  },
  folderId: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    required: false
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
  port: {
    type: Number,
    default: 22
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Server', ServerSchema); 