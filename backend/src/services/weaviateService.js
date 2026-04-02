/**
 * Weaviate service
 * Handles all Weaviate database operations
 */
const { createWeaviateClient } = require('../config/weaviate');
const config = require('../config/env');

let client = null;
let themesCache = null;
let themesCacheTime = null;
let panelsCache = null;
let panelsCacheTime = null;
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get or create Weaviate client
 * @returns {Object} - Weaviate client instance
 */
function getClient() {
  if (!client) {
    client = createWeaviateClient();
  }
  return client;
}

/**
 * Get client reference (for v1.6.0 API which uses data/graphql instead of collections)
 * @returns {Object} - Weaviate client instance
 */
function getClientForQuery() {
  return getClient();
}

/**
 * Execute hybrid search on DocChunk collection
 * @param {string} query - Text query
 * @param {Array<number>} vector - Embedding vector
 * @param {number} alpha - Hybrid search alpha (0-1)
 * @param {number} limit - Maximum results to return
 * @param {Object} filters - Weaviate filter object
 * @returns {Promise<Array>} - Search results
 */
async function hybridSearch(query, vector, alpha = 0.75, limit = 10, filters = null) {
  try {
    const client = getClientForQuery();
    
    const queryBuilder = client.graphql.get()
      .withClassName(config.weaviate.collection)
      .withFields([
        'text',
        'file_name',
        'chunk_start_time',
        'chunk_id',
        'chunk_speakers',
        'panel_theme',
        'panel_code',
        'doc_id'
      ])
      .withHybrid({
        query: query,
        vector: vector,
        alpha: alpha
      })
      .withLimit(limit);
    
    // Try to add _additional score if method exists
    if (typeof queryBuilder.withAdditional === 'function') {
      queryBuilder.withAdditional(['score']);
    } else if (typeof queryBuilder.extendAdditional === 'function') {
      queryBuilder.extendAdditional('score');
    }
    
    // Add filters if provided
    if (filters) {
      queryBuilder.withWhere(buildWhereFilterForBuilder(filters));
    }
    
    let response;
    try {
      response = await queryBuilder.do();
      
      // Check for GraphQL errors in response
      if (response.errors && response.errors.length > 0) {
        const errorMsg = response.errors.map(e => e.message).join('; ');
        throw new Error(`Weaviate query returned errors: ${errorMsg}`);
      }
    } catch (builderError) {
      throw builderError;
    }
    
    // Transform response to match expected format
    // Response structure: { data: { Get: { [className]: [...] } } }
    const className = config.weaviate.collection;
    if (response.data && response.data.Get && response.data.Get[className]) {
      const results = response.data.Get[className].map(obj => ({
        properties: {
          text: obj.text || '',
          file_name: obj.file_name || '',
          chunk_start_time: obj.chunk_start_time || '00:00:00',
          chunk_id: obj.chunk_id || '',
          chunk_speakers: obj.chunk_speakers || '—',
          panel_theme: obj.panel_theme || '',
          panel_code: obj.panel_code || '',
          doc_id: obj.doc_id || ''
        },
        metadata: {
          score: obj._additional?.score || 0
        }
      }));
      
      return results;
    }
    
    return [];
  } catch (error) {
    console.error('Weaviate hybrid search error:', error);
    throw new Error(`Weaviate search failed: ${error.message}`);
  }
}

/**
 * Build where filter object for query builder (not GraphQL string)
 */
function buildWhereFilterForBuilder(filter) {
  if (!filter) return null;
  
  if (filter.operator === 'And' && filter.operands) {
    return {
      operator: 'And',
      operands: filter.operands.map(op => buildWhereFilterForBuilder(op))
    };
  }
  
  if (filter.path && filter.operator) {
    const result = {
      path: filter.path,
      operator: filter.operator
    };
    
    if (filter.valueString !== undefined) {
      result.valueString = filter.valueString;
    } else if (filter.valueText !== undefined) {
      result.valueText = filter.valueText;
    } else if (filter.valueInt !== undefined) {
      result.valueInt = filter.valueInt;
    }
    
    return result;
  }
  
  return null;
}


/**
 * Get panel metadata from CSPC_Panels collection
 * @param {string} panelCode - Panel code (string or number)
 * @returns {Promise<Object>} - Panel metadata
 */
async function getPanelMetadata(panelCode) {
  if (!panelCode) {
    return {};
  }
  
  try {
    const client = getClientForQuery();
    
    // Use graphql.get() builder pattern
    let response;
    let queryMethod = 'string';
    try {
      // Try string first
      response = await client.graphql.get()
        .withClassName('CSPC_Panels')
        .withFields([
          'panel_code',
          'title',
          'theme',
          'photo_url',
          'speaker_photo_url',
          'organized_by',
          'speakers',
          'panel_date',
          'panel_url',
          'external_details_url'
        ])
        .withWhere({
          path: ['panel_code'],
          operator: 'Equal',
          valueString: String(panelCode)
        })
        .withLimit(1)
        .do();
    } catch (e) {
      // If string fails, try integer
      queryMethod = 'integer';
      try {
        const intValue = parseInt(panelCode, 10);
        response = await client.graphql.get()
          .withClassName('CSPC_Panels')
          .withFields([
            'panel_code',
            'title',
            'theme',
            'photo_url',
            'speaker_photo_url',
            'organized_by',
            'panel_organized_by',
            'speakers',
            'panel_date',
            'panel_url',
            'external_details_url'
          ])
          .withWhere({
            path: ['panel_code'],
            operator: 'Equal',
            valueInt: intValue
          })
          .withLimit(1)
          .do();
      } catch (intError) {
        console.error(`[getPanelMetadata] Both string and integer queries failed for panel ${panelCode}:`, intError);
        throw intError;
      }
    }
    
    const panels = response.data?.Get?.CSPC_Panels || [];
    if (panels.length === 0) {
      return {};
    }
    
    const panelData = panels[0];
    
    // Helper to get first item from list or value
    const firstOrValue = (val) => {
      if (Array.isArray(val)) {
        return val.length > 0 ? val[0] : null;
      }
      return val;
    };
    
    // Handle speakers - could be string, array, or null
    let speakers = panelData.speakers || [];
    if (typeof speakers === 'string') {
      // If it's a string, try to parse it or use as-is
      speakers = speakers.trim() ? [speakers] : [];
    } else if (!Array.isArray(speakers)) {
      speakers = [];
    }
    
    // Use external_details_url as fallback for panel_url (matching original Python logic)
    const panelUrl = firstOrValue(panelData.panel_url) || firstOrValue(panelData.external_details_url) || '';
    
    const result = {
      panel_code: panelData.panel_code,
      title: panelData.title || '',
      theme: panelData.theme || '',
      photo_url: firstOrValue(panelData.photo_url),
      speaker_photo_url: firstOrValue(panelData.speaker_photo_url),
      organized_by: panelData.organized_by || panelData.panel_organized_by || '',
      speakers: speakers,
      panel_date: panelData.panel_date || '',
      panel_url: panelUrl,
      external_details_url: panelData.external_details_url || '',
      _raw: panelData
    };
    
    return result;
  } catch (error) {
    console.error(`[getPanelMetadata] Error fetching CSPC_Panels data for panel ${panelCode}:`, error);
    console.error(`[getPanelMetadata] Error stack:`, error.stack);
    return {};
  }
}

/**
 * Get all unique themes from CSPC_Panels collection (cached)
 * @returns {Promise<Array<string>>} - Sorted list of themes
 */
async function getAllThemes() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (themesCache && themesCacheTime && (now - themesCacheTime) < CACHE_TTL) {
    return themesCache;
  }
  
  try {
    const client = getClientForQuery();
    const response = await client.graphql.get()
      .withClassName('CSPC_Panels')
      .withFields(['theme'])
      .withLimit(1000)
      .do();
    
    const themes = new Set();
    
    const panels = response.data?.Get?.CSPC_Panels || [];
    for (const obj of panels) {
      const theme = obj.theme;
      if (theme) {
        themes.add(theme);
      }
    }
    
    const sortedThemes = Array.from(themes).sort();
    
    // Cache the results
    themesCache = sortedThemes;
    themesCacheTime = now;
    
    return sortedThemes;
  } catch (error) {
    console.warn('Could not fetch themes:', error.message);
    return [];
  }
}

/**
 * Get all panels from CSPC_Panels collection (cached)
 * @returns {Promise<Array>} - List of panels with code and display format
 */
async function getAllPanels() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (panelsCache && panelsCacheTime && (now - panelsCacheTime) < CACHE_TTL) {
    return panelsCache;
  }
  
  try {
    const client = getClientForQuery();
    const response = await client.graphql.get()
      .withClassName('CSPC_Panels')
      .withFields(['panel_code', 'title'])
      .withLimit(1000)
      .do();
    
    const panels = [];
    
    const panelResults = response.data?.Get?.CSPC_Panels || [];
    if (panelResults.length > 0) {
      for (const obj of panelResults) {
        const panelCode = obj.panel_code;
        const title = obj.title || '';
        
        if (panelCode) {
          let display = `Panel ${panelCode}`;
          if (title) {
            const truncatedTitle = title.length > 50 ? title.substring(0, 50) + '...' : title;
            display += ` - ${truncatedTitle}`;
          }
          panels.push({
            code: String(panelCode),
            display: display
          });
        }
      }
    }
    
    // Sort by panel code (numeric)
    panels.sort((a, b) => {
      const codeA = parseInt(a.code, 10) || 999999;
      const codeB = parseInt(b.code, 10) || 999999;
      return codeA - codeB;
    });
    
    // Cache the results
    panelsCache = panels;
    panelsCacheTime = now;
    
    return panels;
  } catch (error) {
    console.warn('Could not fetch panels:', error.message);
    return [];
  }
}

/**
 * Filter panels by theme
 * @param {string} theme - Theme name to filter by
 * @returns {Promise<Array>} - Filtered list of panels
 */
async function filterPanelsByTheme(theme) {
  try {
    const client = getClientForQuery();
    const response = await client.graphql.get()
      .withClassName('CSPC_Panels')
      .withFields(['panel_code'])
      .withWhere({
        path: ['theme'],
        operator: 'Equal',
        valueString: theme
      })
      .withLimit(1000)
      .do();
    
    const filteredPanelCodes = new Set();
    
    const panelResults = response.data?.Get?.CSPC_Panels || [];
    if (panelResults.length > 0) {
      for (const obj of panelResults) {
        const panelCode = obj.panel_code;
        if (panelCode) {
          filteredPanelCodes.add(String(panelCode));
        }
      }
    }
    
    // Get all panels and filter by codes
    const allPanels = await getAllPanels();
    return allPanels.filter(panel => filteredPanelCodes.has(panel.code));
  } catch (error) {
    console.warn(`Could not filter panels by theme ${theme}:`, error.message);
    return [];
  }
}

module.exports = {
  getClient,
  hybridSearch,
  getPanelMetadata,
  getAllThemes,
  getAllPanels,
  filterPanelsByTheme
};
