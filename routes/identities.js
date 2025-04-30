const express = require('express');
const router = express.Router();
const Identity = require('../models/Identity');

// Get all identities
router.get('/', async (req, res) => {
  try {
    // Do not return sensitive data in the list view
    const identities = await Identity.find().select('-password -privateKey -keyPassphrase');
    res.json(identities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single identity
router.get('/:id', async (req, res) => {
  try {
    console.log(`Fetching identity with ID: ${req.params.id}`);
    const identity = await Identity.findById(req.params.id);
    if (!identity) {
      console.log('Identity not found');
      return res.status(404).json({ message: 'Identity not found' });
    }
    
    console.log('Identity found:', {
      id: identity._id,
      name: identity.name,
      username: identity.username,
      authType: identity.authType
    });
    
    res.json(identity);
  } catch (err) {
    console.error('Error fetching identity:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create an identity
router.post('/', async (req, res) => {
  try {
    console.log('Saving identity with data:', {
      name: req.body.name,
      username: req.body.username,
      authType: req.body.authType || 'password',
      passwordProvided: !!req.body.password,
      privateKeyProvided: !!req.body.privateKey
    });
    
    const identity = new Identity({
      name: req.body.name,
      username: req.body.username,
      authType: req.body.authType || 'password',
      password: req.body.password,
      privateKey: req.body.privateKey,
      keyPassphrase: req.body.keyPassphrase
    });

    const newIdentity = await identity.save();
    console.log('Identity saved successfully. ID:', newIdentity._id);
    
    res.status(201).json(newIdentity);
  } catch (err) {
    console.error('Error saving identity:', err);
    res.status(400).json({ message: err.message });
  }
});

// Update an identity
router.put('/:id', async (req, res) => {
  try {
    const identity = await Identity.findById(req.params.id);
    if (!identity) {
      return res.status(404).json({ message: 'Identity not found' });
    }

    console.log('Updating identity with data:', {
      id: req.params.id,
      name: req.body.name,
      username: req.body.username,
      authType: req.body.authType,
      passwordUpdated: !!req.body.password,
      privateKeyUpdated: !!req.body.privateKey
    });

    if (req.body.name) identity.name = req.body.name;
    if (req.body.username) identity.username = req.body.username;
    if (req.body.authType) identity.authType = req.body.authType;
    
    // Handle auth type specific fields
    if (req.body.authType === 'password') {
      if (req.body.password) identity.password = req.body.password;
      // Clear any key data if switching to password auth
      identity.privateKey = undefined;
      identity.keyPassphrase = undefined;
    } else if (req.body.authType === 'key') {
      if (req.body.privateKey) identity.privateKey = req.body.privateKey;
      // Passphrase is optional for key auth
      if (req.body.keyPassphrase) {
        identity.keyPassphrase = req.body.keyPassphrase;
      } else {
        identity.keyPassphrase = undefined;
      }
      // Clear password if switching to key auth
      identity.password = undefined;
    }

    const updatedIdentity = await identity.save();
    console.log('Identity updated successfully.');
    res.json(updatedIdentity);
  } catch (err) {
    console.error('Error updating identity:', err);
    res.status(400).json({ message: err.message });
  }
});

// Delete an identity
router.delete('/:id', async (req, res) => {
  try {
    const identity = await Identity.findById(req.params.id);
    if (!identity) {
      return res.status(404).json({ message: 'Identity not found' });
    }

    await Identity.findByIdAndDelete(req.params.id);
    res.json({ message: 'Identity deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 