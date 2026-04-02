/**
 * Health check routes
 */
const express = require('express');
const router = express.Router();
const config = require('../config/env');

/**
 * Basic health check
 */
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * Weaviate connection health check
 */
router.get('/weaviate', async (req, res) => {
  try {
    const { getClient } = require('../services/weaviateService');
    const client = getClient();
    
    // Try to query schema as a health check (v1.6.0 API)
    const schemaResponse = await client.schema.getter().do();
    const classes = schemaResponse.classes || [];
    
    res.json({
      status: 'healthy',
      service: 'weaviate',
      collections: classes.length
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'weaviate',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * OpenAI connection health check
 */
router.get('/openai', async (req, res) => {
  try {
    const apiKey = config.openai.apiKey;
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'openai',
        error: 'OpenAI API key not configured or invalid'
      });
    }
    
    // Just validate key format, don't make actual API call
    res.json({
      status: 'healthy',
      service: 'openai',
      keyConfigured: true
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'openai',
      error: error.message
    });
  }
});

/**
 * Reranker service health check
 * Note: Reranker is now a pure JavaScript implementation, no external service needed
 */
router.get('/reranker', async (req, res) => {
  try {
    // Check if reranker model is configured
    const model = config.reranker?.model || 'Xenova/ms-marco-MiniLM-L-6-v2';
    
    res.json({
      status: 'healthy',
      service: 'reranker',
      implementation: 'pure-javascript',
      model: model
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'reranker',
      error: error.message
    });
  }
});

module.exports = router;
