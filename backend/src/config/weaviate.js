/**
 * Weaviate client configuration
 */
const weaviate = require('weaviate-ts-client');
const config = require('./env');

/**
 * Create and return Weaviate client
 * @returns {Object} - Weaviate client instance
 */
function createWeaviateClient() {
  try {
    // Try to get client function - check both direct and default export
    let clientFn = null;
    let ApiKeyClass = null;
    
    if (typeof weaviate.client === 'function') {
      clientFn = weaviate.client;
      ApiKeyClass = weaviate.ApiKey;
    } else if (weaviate.default && typeof weaviate.default.client === 'function') {
      clientFn = weaviate.default.client;
      ApiKeyClass = weaviate.default.ApiKey;
    } else if (typeof weaviate === 'function') {
      // If the entire module is the client function
      clientFn = weaviate;
      ApiKeyClass = weaviate.ApiKey;
    }
    
    if (!clientFn) {
      throw new Error(
        'Could not find weaviate.client function. ' +
        'Available exports: ' + Object.keys(weaviate || {}).join(', ')
      );
    }
    
    // Create API key instance if ApiKey class is available
    const apiKey = ApiKeyClass 
      ? new ApiKeyClass(config.weaviate.apiKey)
      : config.weaviate.apiKey;
    
    const client = clientFn({
      scheme: 'https',
      host: config.weaviate.url,
      apiKey: apiKey,
    });
    
    return client;
  } catch (error) {
    console.error('Failed to create Weaviate client:', error);
    throw error;
  }
}

module.exports = {
  createWeaviateClient
};
