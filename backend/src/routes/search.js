/**
 * Search routes
 * Main search endpoint that orchestrates the entire search flow
 */
const express = require('express');
const router = express.Router();
const { validateSearchRequest } = require('../middleware/validation');
const { generateEmbedding } = require('../services/openaiService');
const { hybridSearch, getPanelMetadata } = require('../services/weaviateService');
const { rerankResults: rerankSearchResults } = require('../services/rerankerService');
const { buildAudioUrl } = require('../utils/audioUrlBuilder');
const config = require('../config/env');

/**
 * Extract panel code from panel display string
 * "Panel 123 - Title" -> "123"
 */
function extractPanelCode(panelDisplay) {
  if (!panelDisplay || panelDisplay === 'All') {
    return null;
  }
  const match = panelDisplay.match(/Panel\s+(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract panel code from file name (fallback)
 */
function extractPanelCodeFromFileName(fileName) {
  if (!fileName) return 'Unknown';
  const match = fileName.match(/(\d+)/);
  return match ? match[1] : 'Unknown';
}

/**
 * Build Weaviate filter from theme and panel
 */
function buildFilters(theme, panel) {
  const filters = [];
  
  if (theme && theme !== 'All') {
    filters.push({
      path: ['panel_theme'],
      operator: 'Equal',
      valueText: theme
    });
  }
  
  if (panel && panel !== 'All') {
    const panelCode = extractPanelCode(panel);
    if (panelCode) {
      filters.push({
        path: ['panel_code'],
        operator: 'Equal',
        valueString: panelCode
      });
    }
  }
  
  if (filters.length === 0) {
    return null;
  } else if (filters.length === 1) {
    return filters[0];
  } else {
    // Combine with AND
    return {
      operator: 'And',
      operands: filters
    };
  }
}

/**
 * Main search endpoint
 * POST /api/search
 */
router.post('/', validateSearchRequest, async (req, res) => {
  const startTime = Date.now();
  const debugInfo = {
    embeddingTime: 0,
    weaviateTime: 0,
    rerankTime: 0,
    rawResultsCount: 0,
    filteredResultsCount: 0
  };
  
  try {
    const { question, theme = 'All', panel = 'All', debug = false } = req.body;
    
    // Validate OpenAI key
    if (!config.openai.apiKey || !config.openai.apiKey.startsWith('sk-')) {
      return res.status(503).json({
        error: 'Service temporarily unavailable. (Missing OpenAI key on server.)'
      });
    }
    
    // Step 1: Generate embedding
    const embeddingStart = Date.now();
    let embedding;
    try {
      embedding = await generateEmbedding(question);
      debugInfo.embeddingTime = Date.now() - embeddingStart;
    } catch (error) {
      return res.status(500).json({
        error: 'Failed to generate embedding',
        message: error.message
      });
    }
    
    // Step 2: Build filters
    const filters = buildFilters(theme, panel);
    
    // Step 3: Execute hybrid search
    const weaviateStart = Date.now();
    const useReranker = true; // Always use reranker
    const topK = 10;
    const limit = useReranker ? 50 : topK;
    
    let searchResults;
    try {
      searchResults = await hybridSearch(
        question,
        embedding,
        0.75, // alpha
        limit,
        filters
      );
      debugInfo.weaviateTime = Date.now() - weaviateStart;
      debugInfo.rawResultsCount = searchResults.length;
      
    } catch (error) {
      return res.status(500).json({
        error: 'Search failed',
        message: error.message
      });
    }
    
    // Step 4: Rerank results
    let rerankedResults = searchResults;
    if (useReranker && searchResults.length > 0) {
      const rerankStart = Date.now();
      try {
        rerankedResults = await rerankSearchResults(question, searchResults);
        debugInfo.rerankTime = Date.now() - rerankStart;
      } catch (error) {
        console.warn('Reranking failed, using original results:', error.message);
        // Continue with original results
        rerankedResults = searchResults;
      }
    }
    
    // Step 5: Take top K results
    const topResults = rerankedResults.slice(0, topK);
    debugInfo.filteredResultsCount = topResults.length;
    
    if (topResults.length === 0) {
      return res.json({
        results: [],
        summary: {
          totalResults: 0,
          totalPanels: 0
        },
        ...(debug && { debug: debugInfo })
      });
    }
    
    // Step 6: Group results by panel_code
    const panelsDict = {};
    for (let i = 0; i < topResults.length; i++) {
      const result = topResults[i];
      const props = result.properties || result;
      let panelCode = props.panel_code;
      
      // Fallback: extract from file_name
      if (!panelCode) {
        panelCode = extractPanelCodeFromFileName(props.file_name);
      }
      
      panelCode = String(panelCode);
      
      if (!panelsDict[panelCode]) {
        panelsDict[panelCode] = [];
      }
      
      panelsDict[panelCode].push({
        rank: i + 1,
        obj: result
      });
    }
    
    // Step 7: Fetch panel metadata and build audio URLs
    const panelCodes = Object.keys(panelsDict);
    const panelMetadataPromises = panelCodes.map(code => getPanelMetadata(code));
    const panelMetadataArray = await Promise.all(panelMetadataPromises);
    
    const panelMetadataMap = {};
    panelCodes.forEach((code, index) => {
      const metadata = panelMetadataArray[index] || {};
      panelMetadataMap[code] = metadata;
    });
    
    // Step 8: Build final results structure
    const results = [];
    for (const [panelCode, items] of Object.entries(panelsDict)) {
      const metadata = panelMetadataMap[panelCode] || {};
      const chunks = items.map(item => {
        const props = item.obj.properties || item.obj;
        const fileName = props.file_name;
        const audioUrl = fileName
          ? buildAudioUrl(fileName, config.s3.bucket, config.s3.region, config.s3.audioPrefix)
          : null;
        
        return {
          rank: item.rank,
          text: props.text || '',
          chunk_start_time: props.chunk_start_time || '00:00:00',
          chunk_speakers: props.chunk_speakers || '—',
          file_name: fileName,
          panel_code: props.panel_code || panelCode,
          panel_theme: props.panel_theme || '',
          score: item.obj.metadata?.score || 0,
          rerank_score: item.obj._rerank_score || 0,
          audio_url: audioUrl
        };
      });
      
      // Sort chunks by rank
      chunks.sort((a, b) => a.rank - b.rank);
      
      // Use external_details_url as fallback for panel_url (matching original Python logic)
      const panelUrl = metadata.panel_url || metadata.external_details_url || '';
      
      results.push({
        panelCode: panelCode,
        panelMetadata: {
          title: metadata.title || '',
          theme: metadata.theme || '',
          organized_by: metadata.organized_by || '',
          speakers: Array.isArray(metadata.speakers) ? metadata.speakers : (metadata.speakers ? [metadata.speakers] : []),
          panel_date: metadata.panel_date || '',
          panel_url: panelUrl,
          photo_url: metadata.photo_url || null,
          speaker_photo_url: metadata.speaker_photo_url || null
        },
        chunks: chunks
      });
    }
    
    // Step 9: Sort panels by best rank
    results.sort((a, b) => {
      const bestRankA = Math.min(...a.chunks.map(c => c.rank));
      const bestRankB = Math.min(...b.chunks.map(c => c.rank));
      return bestRankA - bestRankB;
    });
    
    // Step 10: Return response
    const totalResults = topResults.length;
    const totalPanels = results.length;
    
    res.json({
      results: results,
      summary: {
        totalResults: totalResults,
        totalPanels: totalPanels
      },
      ...(debug && { debug: debugInfo })
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      ...(req.body.debug && { debug: debugInfo })
    });
  }
});

module.exports = router;
