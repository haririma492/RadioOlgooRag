/**
 * Verification Script for CSPC RAG Backend Setup
 * Checks environment variables, API keys, and service connectivity
 */

require('dotenv').config();
const axios = require('axios');
const config = require('./src/config/env');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function checkEnvVar(name, value, required = true) {
  const isSet = value && value !== '' && !value.includes('your_') && !value.includes('placeholder');
  const status = isSet ? '✓' : '✗';
  const color = isSet ? 'green' : (required ? 'red' : 'yellow');
  
  if (isSet) {
    // Mask the key for security
    const masked = value.length > 10 ? value.substring(0, 4) + '...' + value.substring(value.length - 4) : '***';
    log(`${status} ${name}: ${masked}`, color);
  } else {
    log(`${status} ${name}: ${required ? 'MISSING (REQUIRED)' : 'Not set (optional)'}`, color);
  }
  
  return { name, isSet, required };
}

async function testBackendHealth() {
  try {
    const response = await axios.get(`http://localhost:${config.server.port}/api/health`, {
      timeout: 5000
    });
    log('✓ Backend server is running', 'green');
    return true;
  } catch (error) {
    log('✗ Backend server is not running or not accessible', 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return false;
  }
}

async function testWeaviateHealth() {
  try {
    const response = await axios.get(`http://localhost:${config.server.port}/api/health/weaviate`, {
      timeout: 10000
    });
    if (response.data.status === 'healthy') {
      log('✓ Weaviate connection: HEALTHY', 'green');
      log(`  Collections found: ${response.data.collections || 'N/A'}`, 'blue');
      return true;
    } else {
      log('✗ Weaviate connection: UNHEALTHY', 'red');
      log(`  Error: ${response.data.error || 'Unknown error'}`, 'yellow');
      return false;
    }
  } catch (error) {
    log('✗ Weaviate health check failed', 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return false;
  }
}

async function testOpenAIHealth() {
  try {
    const response = await axios.get(`http://localhost:${config.server.port}/api/health/openai`, {
      timeout: 5000
    });
    if (response.data.status === 'healthy') {
      log('✓ OpenAI API key: VALID FORMAT', 'green');
      return true;
    } else {
      log('✗ OpenAI API key: INVALID OR MISSING', 'red');
      log(`  Error: ${response.data.error || 'Unknown error'}`, 'yellow');
      return false;
    }
  } catch (error) {
    log('✗ OpenAI health check failed', 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return false;
  }
}

async function testRerankerHealth() {
  try {
    const response = await axios.get(`http://localhost:${config.server.port}/api/health/reranker`, {
      timeout: 5000
    });
    if (response.data.status === 'healthy') {
      log('✓ Reranker service: HEALTHY', 'green');
      log(`  Model loaded: ${response.data.model_loaded ? 'Yes' : 'No'}`, 'blue');
      return true;
    } else {
      log('✗ Reranker service: UNHEALTHY', 'red');
      log(`  Error: ${response.data.error || 'Unknown error'}`, 'yellow');
      return false;
    }
  } catch (error) {
    log('✗ Reranker service: NOT RUNNING', 'yellow');
    log(`  Note: This is optional. Search will work without reranking.`, 'yellow');
    return false;
  }
}

async function testSearchEndpoint() {
  try {
    const response = await axios.post(
      `http://localhost:${config.server.port}/api/search`,
      {
        question: 'test query',
        theme: 'All',
        panel: 'All',
        debug: false
      },
      {
        timeout: 30000,
        validateStatus: (status) => status < 500 // Don't throw on 4xx
      }
    );
    
    if (response.status === 200) {
      log('✓ Search endpoint: WORKING', 'green');
      log(`  Results: ${response.data.summary?.totalResults || 0} results from ${response.data.summary?.totalPanels || 0} panels`, 'blue');
      return true;
    } else {
      log('✗ Search endpoint: ERROR', 'red');
      log(`  Status: ${response.status}`, 'yellow');
      log(`  Error: ${response.data.error || 'Unknown error'}`, 'yellow');
      return false;
    }
  } catch (error) {
    if (error.response) {
      log('✗ Search endpoint: ERROR', 'red');
      log(`  Status: ${error.response.status}`, 'yellow');
      log(`  Error: ${error.response.data?.error || error.message}`, 'yellow');
    } else {
      log('✗ Search endpoint: CONNECTION FAILED', 'red');
      log(`  Error: ${error.message}`, 'yellow');
    }
    return false;
  }
}

async function extractKeysFromOldProject() {
  logSection('EXTRACTING KEYS FROM OLD PROJECT');
  
  const pythonFiles = [
    '../Query_Corpos_PanelGroups_CloudDeployement.py',
    '../Query_Corpos_PanelGroups_CloudDeployement11_FinalWithAIAnswer.py'
  ];
  
  const fs = require('fs');
  const path = require('path');
  
  let foundKeys = {
    weaviate_url: null,
    weaviate_key: null,
    openai_key: null
  };
  
  for (const file of pythonFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      log(`Checking: ${file}`, 'blue');
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Look for os.getenv patterns
      const weaviateUrlMatch = content.match(/os\.getenv\(["']WEAVIATE_URL["'],\s*["']([^"']+)["']\)/);
      const weaviateKeyMatch = content.match(/os\.getenv\(["']WEAVIATE_API_KEY["'],\s*["']([^"']*)["']\)/);
      const openaiKeyMatch = content.match(/os\.getenv\(["']OPENAI_API_KEY["'],\s*["']([^"']*)["']\)/);
      
      if (weaviateUrlMatch && !foundKeys.weaviate_url) {
        foundKeys.weaviate_url = weaviateUrlMatch[1];
      }
      if (weaviateKeyMatch && weaviateKeyMatch[1] && !foundKeys.weaviate_key) {
        foundKeys.weaviate_key = weaviateKeyMatch[1];
      }
      if (openaiKeyMatch && openaiKeyMatch[1] && !foundKeys.openai_key) {
        foundKeys.openai_key = openaiKeyMatch[1];
      }
    }
  }
  
  if (foundKeys.weaviate_url) {
    log(`✓ Found Weaviate URL: ${foundKeys.weaviate_url}`, 'green');
  }
  if (foundKeys.weaviate_key && foundKeys.weaviate_key !== '') {
    log(`✓ Found Weaviate Key: ${foundKeys.weaviate_key.substring(0, 4)}...${foundKeys.weaviate_key.substring(foundKeys.weaviate_key.length - 4)}`, 'green');
  } else {
    log('✗ Weaviate Key: Not found in old project (likely in environment/secrets)', 'yellow');
  }
  if (foundKeys.openai_key && foundKeys.openai_key.startsWith('sk-')) {
    log(`✓ Found OpenAI Key: ${foundKeys.openai_key.substring(0, 7)}...${foundKeys.openai_key.substring(foundKeys.openai_key.length - 4)}`, 'green');
  } else {
    log('✗ OpenAI Key: Not found in old project (likely in environment/secrets)', 'yellow');
  }
  
  return foundKeys;
}

async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('CSPC RAG Backend Setup Verification', 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
  
  // Step 1: Check Environment Variables
  logSection('STEP 1: ENVIRONMENT VARIABLES');
  
  const envChecks = [
    checkEnvVar('WEAVIATE_URL', config.weaviate.url, true),
    checkEnvVar('WEAVIATE_API_KEY', config.weaviate.apiKey, true),
    checkEnvVar('OPENAI_API_KEY', config.openai.apiKey, true),
    checkEnvVar('S3_BUCKET', config.s3.bucket, false)
  ];
  
  const missingRequired = envChecks.filter(c => c.required && !c.isSet);
  
  // Step 2: Extract keys from old project
  const oldProjectKeys = await extractKeysFromOldProject();
  
  // Step 3: Test Backend Services
  logSection('STEP 2: BACKEND SERVICES');
  
  const backendRunning = await testBackendHealth();
  
  if (!backendRunning) {
    log('\n⚠️  Backend server is not running. Please start it with:', 'yellow');
    log('   cd CSPC_/backend && npm run dev', 'yellow');
    log('\nSkipping service tests...\n', 'yellow');
    generateSummary(envChecks, oldProjectKeys, []);
    return;
  }
  
  const serviceTests = [
    { name: 'Weaviate', test: testWeaviateHealth },
    { name: 'OpenAI', test: testOpenAIHealth },
    { name: 'Reranker', test: testRerankerHealth },
    { name: 'Search Endpoint', test: testSearchEndpoint }
  ];
  
  const testResults = [];
  for (const service of serviceTests) {
    const result = await service.test();
    testResults.push({ name: service.name, passed: result });
  }
  
  // Step 4: Generate Summary
  generateSummary(envChecks, oldProjectKeys, testResults);
}

function generateSummary(envChecks, oldProjectKeys, testResults) {
  logSection('SUMMARY & RECOMMENDATIONS');
  
  const missingRequired = envChecks.filter(c => c.required && !c.isSet);
  
  if (missingRequired.length === 0 && testResults.every(t => t.passed)) {
    log('🎉 All checks passed! Your setup is ready to use.', 'green');
    return;
  }
  
  if (missingRequired.length > 0) {
    log('\n⚠️  MISSING REQUIRED ENVIRONMENT VARIABLES:', 'yellow');
    missingRequired.forEach(check => {
      log(`   - ${check.name}`, 'red');
    });
    
    log('\n📝 TO FIX:', 'yellow');
    log('1. Open CSPC_/backend/.env file', 'blue');
    log('2. Add the missing keys:', 'blue');
    
    if (!config.weaviate.apiKey || config.weaviate.apiKey.includes('your_')) {
      log('   WEAVIATE_API_KEY=your_actual_weaviate_key_here', 'blue');
    }
    if (!config.openai.apiKey || config.openai.apiKey.includes('your_')) {
      log('   OPENAI_API_KEY=sk-your_actual_openai_key_here', 'blue');
    }
    
    log('\n💡 WHERE TO GET KEYS:', 'yellow');
    log('   - Weaviate: Check your Weaviate Cloud dashboard', 'blue');
    log('   - OpenAI: https://platform.openai.com/api-keys', 'blue');
    
    if (!oldProjectKeys.weaviate_key && !oldProjectKeys.openai_key) {
      log('\n📧 You may need to ask your client for these keys.', 'yellow');
      log('   (Keys are not stored in the old project files)', 'yellow');
    }
  }
  
  if (testResults.length > 0) {
    const failedTests = testResults.filter(t => !t.passed);
    if (failedTests.length > 0) {
      log('\n⚠️  FAILED SERVICE TESTS:', 'yellow');
      failedTests.forEach(test => {
        log(`   - ${test.name}`, 'red');
      });
    }
  }
  
  log('\n' + '='.repeat(60) + '\n', 'cyan');
}

// Run the verification
main().catch(error => {
  log('\n✗ Verification script failed:', 'red');
  log(`   ${error.message}`, 'red');
  process.exit(1);
});
