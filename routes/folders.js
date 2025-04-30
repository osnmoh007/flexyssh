const express = require('express');
const router = express.Router();
const Folder = require('../models/Folder');

/**
 * @route   GET /api/folders
 * @desc    Get all folders
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const folders = await Folder.find().sort({ name: 1 });
    res.json(folders);
  } catch (err) {
    console.error('Error fetching folders:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   GET /api/folders/:id
 * @desc    Get a single folder by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    res.json(folder);
  } catch (err) {
    console.error('Error fetching folder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   POST /api/folders
 * @desc    Create a new folder
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Folder name is required' });
    }
    
    // Check if a folder with this name already exists
    const existingFolder = await Folder.findOne({ name });
    if (existingFolder) {
      return res.status(400).json({ message: 'A folder with this name already exists' });
    }
    
    const newFolder = new Folder({
      name,
      color: color || '#007acc'
    });
    
    const savedFolder = await newFolder.save();
    res.status(201).json(savedFolder);
  } catch (err) {
    console.error('Error creating folder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   PUT /api/folders/:id
 * @desc    Update a folder
 * @access  Public
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Folder name is required' });
    }
    
    // Check if another folder with this name already exists (except this one)
    const existingFolder = await Folder.findOne({ 
      name, 
      _id: { $ne: req.params.id } 
    });
    
    if (existingFolder) {
      return res.status(400).json({ message: 'A folder with this name already exists' });
    }
    
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { name, color },
      { new: true }
    );
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    res.json(folder);
  } catch (err) {
    console.error('Error updating folder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @route   DELETE /api/folders/:id
 * @desc    Delete a folder
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    await Folder.deleteOne({ _id: req.params.id });
    res.json({ message: 'Folder removed' });
  } catch (err) {
    console.error('Error deleting folder:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 