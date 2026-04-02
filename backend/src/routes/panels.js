/**
 * Panels routes
 */
const express = require('express');
const router = express.Router();
const { getAllPanels, filterPanelsByTheme } = require('../services/weaviateService');

/**
 * Get all panels, optionally filtered by theme
 * GET /api/panels?theme=ThemeName
 */
router.get('/', async (req, res) => {
  try {
    const { theme } = req.query;
    
    let panels;
    if (theme && theme !== 'All') {
      panels = await filterPanelsByTheme(theme);
    } else {
      panels = await getAllPanels();
    }
    
    res.json(panels);
  } catch (error) {
    console.error('Error fetching panels:', error);
    res.status(500).json({
      error: 'Failed to fetch panels',
      message: error.message
    });
  }
});

module.exports = router;
