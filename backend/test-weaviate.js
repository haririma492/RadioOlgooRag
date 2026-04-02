/**
 * Test script to verify Weaviate connection
 * Run with: node test-weaviate.js
 */
require('dotenv').config();
const weaviate = require('weaviate-ts-client');
const config = require('./src/config/env');

async function testWeaviate() {
  console.log('Testing Weaviate connection...');
  console.log('URL:', config.weaviate.url);
  console.log('API Key:', config.weaviate.apiKey ? 'Set' : 'Not set');
  
  try {
    const client = weaviate.client({
      scheme: 'https',
      host: config.weaviate.url,
      apiKey: new weaviate.ApiKey(config.weaviate.apiKey),
    });
    
    console.log('Client created successfully');
    
    // Try to list collections
    const collections = await client.collections.listAll();
    console.log('Collections:', collections);
    console.log('Test successful!');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testWeaviate();
