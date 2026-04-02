/**
 * OpenAI service
 * Handles embedding generation using OpenAI API
 */
const OpenAI = require('openai');
const config = require('../config/env');

let openaiClient = null;

/**
 * Initialize OpenAI client
 * @returns {OpenAI} - OpenAI client instance
 */
function getOpenAIClient() {
  if (!openaiClient) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: config.openai.apiKey
    });
  }
  return openaiClient;
}

/**
 * Generate embedding for text using OpenAI
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<Array<number>>} - Embedding vector
 */
async function generateEmbedding(text) {
  try {
    const client = getOpenAIClient();
    
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    
    return response.data[0].embedding;
  } catch (error) {
    if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.status === 401) {
      throw new Error('Invalid OpenAI API key.');
    } else {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

module.exports = {
  generateEmbedding,
  getOpenAIClient
};
