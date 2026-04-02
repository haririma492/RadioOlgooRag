/**
 * Themes routes
 */
const express = require('express');
const router = express.Router();
const { getAllThemes } = require('../services/weaviateService');

/**
 * Get all unique themes
 * GET /api/themes
 */
router.get('/', async (req, res) => {
  try {
    const themes = await getAllThemes();
    res.json(themes);
  } catch (error) {
    console.error('Error fetching themes:', error);
    res.status(500).json({
      error: 'Failed to fetch themes',
      message: error.message
    });
  }
});

module.exports = router;
