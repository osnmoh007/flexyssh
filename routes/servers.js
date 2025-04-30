const express = require('express');
const router = express.Router();
const Server = require('../models/Server');

// Get all servers
router.get('/', async (req, res) => {
  try {
    // Do not return passwords in the list view, but include folder info
    const servers = await Server.find()
      .select('-password')
      .populate({
        path: 'folderId',
        select: 'name color'
      });
    res.json(servers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get a single server
router.get('/:id', async (req, res) => {
  try {
    console.log(`Fetching server with ID: ${req.params.id}`);
    
    // Use populate to fetch identity and folder details for the server
    const server = await Server.findById(req.params.id)
      .populate({
        path: 'identityId',
        select: 'name username authType' // Only select fields we need, excluding sensitive data
      })
      .populate({
        path: 'folderId',
        select: 'name color' // Select folder name and color
      });
      
    if (!server) {
      console.log('Server not found');
      return res.status(404).json({ message: 'Server not found' });
    }
    
    console.log('Server found:', {
      id: server._id,
      name: server.name,
      host: server.host,
      username: server.username,
      hasPassword: !!server.password,
      passwordLength: server.password ? server.password.length : 0,
      identityId: server.identityId ? server.identityId._id : 'none',
      identityName: server.identityId ? server.identityId.name : 'none',
      folderId: server.folderId ? server.folderId._id : 'none',
      folderName: server.folderId ? server.folderId.name : 'none'
    });
    
    // Convert to plain object for response manipulation
    const serverObj = server.toObject();
    
    // If an identity is used, add a derived property for displaying in UI
    if (serverObj.identityId) {
      serverObj.identityName = serverObj.identityId.name;
      serverObj.identityUsername = serverObj.identityId.username;
    }

    // If a folder is used, add a derived property for displaying in UI
    if (serverObj.folderId) {
      serverObj.folderName = serverObj.folderId.name;
      serverObj.folderColor = serverObj.folderId.color;
    }
    
    res.json(serverObj);
  } catch (err) {
    console.error('Error fetching server:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create a server
router.post('/', async (req, res) => {
  try {
    console.log('Saving server with data:', {
      name: req.body.name,
      host: req.body.host,
      username: req.body.username,
      authType: req.body.authType || 'password',
      passwordProvided: !!req.body.password,
      passwordLength: req.body.password ? req.body.password.length : 0,
      privateKeyProvided: !!req.body.privateKey,
      privateKeyLength: req.body.privateKey ? req.body.privateKey.length : 0,
      port: req.body.port || 22,
      identityId: req.body.identityId || 'none',
      folderId: req.body.folderId || 'none'
    });
    
    const server = new Server({
      name: req.body.name,
      host: req.body.host,
      username: req.body.username,
      authType: req.body.authType || 'password',
      password: req.body.password,
      privateKey: req.body.privateKey,
      keyPassphrase: req.body.keyPassphrase,
      port: req.body.port || 22,
      identityId: req.body.identityId,
      folderId: req.body.folderId
    });

    const newServer = await server.save();
    console.log('Server saved successfully. ID:', newServer._id);
    console.log('Auth type:', newServer.authType);
    console.log('Identity ID:', newServer.identityId || 'none');
    console.log('Folder ID:', newServer.folderId || 'none');
    console.log('Password saved:', !!newServer.password, 'Length:', newServer.password ? newServer.password.length : 0);
    console.log('Private key saved:', !!newServer.privateKey, 'Length:', newServer.privateKey ? newServer.privateKey.length : 0);
    
    res.status(201).json(newServer);
  } catch (err) {
    console.error('Error saving server:', err);
    res.status(400).json({ message: err.message });
  }
});

// Update a server
router.put('/:id', async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    console.log('Updating server with data:', {
      id: req.params.id,
      name: req.body.name,
      host: req.body.host,
      username: req.body.username,
      authType: req.body.authType,
      passwordUpdated: !!req.body.password,
      privateKeyUpdated: !!req.body.privateKey,
      identityId: req.body.identityId || 'none',
      folderId: req.body.folderId || 'none'
    });

    if (req.body.name) server.name = req.body.name;
    if (req.body.host) server.host = req.body.host;
    if (req.body.username) server.username = req.body.username;
    if (req.body.authType) server.authType = req.body.authType;
    
    // Set or clear identityId
    if (req.body.identityId) {
      server.identityId = req.body.identityId;
    } else {
      server.identityId = undefined;
    }

    // Set or clear folderId
    if (req.body.folderId) {
      server.folderId = req.body.folderId;
    } else {
      server.folderId = undefined;
    }
    
    // Handle auth type specific fields
    if (req.body.authType === 'password') {
      if (req.body.password) server.password = req.body.password;
      // Clear any key data if switching to password auth
      server.privateKey = undefined;
      server.keyPassphrase = undefined;
    } else if (req.body.authType === 'key') {
      if (req.body.privateKey) server.privateKey = req.body.privateKey;
      // Passphrase is optional for key auth
      if (req.body.keyPassphrase) {
        server.keyPassphrase = req.body.keyPassphrase;
      } else {
        server.keyPassphrase = undefined;
      }
      // Clear password if switching to key auth
      server.password = undefined;
    }
    
    if (req.body.port) server.port = req.body.port;

    const updatedServer = await server.save();
    console.log('Server updated successfully. Auth type:', updatedServer.authType);
    console.log('Identity ID:', updatedServer.identityId || 'none');
    console.log('Folder ID:', updatedServer.folderId || 'none');
    res.json(updatedServer);
  } catch (err) {
    console.error('Error updating server:', err);
    res.status(400).json({ message: err.message });
  }
});

// Delete a server
router.delete('/:id', async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    await Server.findByIdAndDelete(req.params.id);
    res.json({ message: 'Server deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 