/**
 * Request validation middleware
 */

/**
 * Validate search request
 */
function validateSearchRequest(req, res, next) {
  const { question, theme, panel, debug } = req.body;
  
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return res.status(400).json({
      error: 'Question is required and must be a non-empty string'
    });
  }
  
  // Optional validation for theme and panel
  if (theme && typeof theme !== 'string') {
    return res.status(400).json({
      error: 'Theme must be a string'
    });
  }
  
  if (panel && typeof panel !== 'string') {
    return res.status(400).json({
      error: 'Panel must be a string'
    });
  }
  
  next();
}

module.exports = {
  validateSearchRequest
};
