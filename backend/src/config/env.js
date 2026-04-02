/**
 * Environment configuration
 * Validates and exports environment variables
 */
// Only load dotenv if not in production (Vercel provides env vars via dashboard)
if (process.env.NODE_ENV !== 'production') {
  try {
    require('dotenv').config();
  } catch (error) {
    // dotenv is optional, continue without it
    console.warn('dotenv not available:', error.message);
  }
}

const requiredEnvVars = [
  'WEAVIATE_URL',
  'WEAVIATE_API_KEY',
  'OPENAI_API_KEY'
];

// Validate required environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('Some features may not work correctly.');
}

const config = {
  weaviate: {
    url: process.env.WEAVIATE_URL || 'nsrnedu9q1qfxusokfl8q.c0.us-west3.gcp.weaviate.cloud',
    apiKey: process.env.WEAVIATE_API_KEY || '',
    collection: process.env.WEAVIATE_COLLECTION || 'DocChunk'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || ''
  },
  s3: {
    bucket: process.env.S3_BUCKET || 'cspc-rag',
    region: process.env.S3_REGION || 'ca-central-1',
    audioPrefix: process.env.S3_AUDIO_PREFIX || 'audio'
  },
  reranker: {
    // Pure JavaScript implementation - no external service needed!
    model: process.env.RERANKER_MODEL || 'Xenova/ms-marco-MiniLM-L-6-v2'
  },
  server: {
    port: parseInt(process.env.PORT || '5000', 10),
    nodeEnv: process.env.NODE_ENV || 'development'
  }
};

module.exports = config;
