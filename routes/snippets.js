const express = require('express');
const router = express.Router();
const Snippet = require('../models/Snippet');

// Get all snippets
router.get('/', async (req, res) => {
  try {
    const snippets = await Snippet.find().sort({ name: 1 });
    res.json(snippets);
  } catch (err) {
    console.error('Error fetching snippets:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get a single snippet
router.get('/:id', async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }
    res.json(snippet);
  } catch (err) {
    console.error('Error fetching snippet:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create a snippet
router.post('/', async (req, res) => {
  try {
    const snippet = new Snippet({
      name: req.body.name,
      content: req.body.content,
      description: req.body.description
    });

    const newSnippet = await snippet.save();
    console.log('Snippet saved successfully. ID:', newSnippet._id);
    res.status(201).json(newSnippet);
  } catch (err) {
    console.error('Error saving snippet:', err);
    res.status(400).json({ message: err.message });
  }
});

// Update a snippet
router.put('/:id', async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    if (req.body.name) snippet.name = req.body.name;
    if (req.body.content) snippet.content = req.body.content;
    
    // Description can be null or empty string
    if (req.body.description !== undefined) {
      snippet.description = req.body.description;
    }

    const updatedSnippet = await snippet.save();
    res.json(updatedSnippet);
  } catch (err) {
    console.error('Error updating snippet:', err);
    res.status(400).json({ message: err.message });
  }
});

// Delete a snippet
router.delete('/:id', async (req, res) => {
  try {
    const snippet = await Snippet.findById(req.params.id);
    if (!snippet) {
      return res.status(404).json({ message: 'Snippet not found' });
    }

    await Snippet.findByIdAndDelete(req.params.id);
    res.json({ message: 'Snippet deleted' });
  } catch (err) {
    console.error('Error deleting snippet:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router; 