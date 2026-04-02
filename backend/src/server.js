/**
 * Express server setup
 */
const express = require('express');

let app;

try {
  const cors = require('cors');
  const config = require('./config/env');
  const logger = require('./middleware/logger');
  const errorHandler = require('./middleware/errorHandler');

  // Import routes
  const healthRoutes = require('./routes/health');
  const themesRoutes = require('./routes/themes');
  const panelsRoutes = require('./routes/panels');
  const searchRoutes = require('./routes/search');

  app = express();

// Middleware
// Allow all origins in development for easier debugging
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(logger);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/panels', panelsRoutes);
app.use('/api/search', searchRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'CSPC RAG API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      themes: '/api/themes',
      panels: '/api/panels',
      search: '/api/search'
    }
  });
});

// Error handling
app.use(errorHandler);

// Start server only when run directly (for local development)
if (require.main === module) {
  const PORT = config.server.port;
  app.listen(PORT, () => {
    console.log(`\n✅ CSPC RAG API server running on port ${PORT}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
    console.log(`API available at: http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`\nNote: Weaviate connection will be tested on first API call.\n`);
  });
}

} catch (error) {
  console.error('=== SERVER INITIALIZATION ERROR ===');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('===================================');
  
  // Create minimal error app
  app = express();
  app.use((req, res) => {
    res.status(500).json({
      error: 'Server initialization failed',
      message: error.message
    });
  });
}

// Export app for Vercel serverless functions
module.exports = app;