/**
 * Reranker service - Pure JavaScript implementation
 * Uses @xenova/transformers to run CrossEncoder model in Node.js
 * No Python dependencies - all in JS!
 */

// Lazy load the reranker model and tokenizer (only load when first needed)
let rerankerModel = null;
let rerankerTokenizer = null;
let modelLoading = null;
let transformersModule = null;

/**
 * Load the CrossEncoder model and tokenizer (lazy initialization)
 * Uses the same model as Streamlit: cross-encoder/ms-marco-MiniLM-L-6-v2
 * We use AutoTokenizer and AutoModelForSequenceClassification directly
 * to properly handle sentence-pair inputs (not the text-classification pipeline)
 */
async function loadRerankerModel() {
  if (rerankerModel && rerankerTokenizer) {
    return { model: rerankerModel, tokenizer: rerankerTokenizer };
  }
  
  if (modelLoading) {
    return modelLoading;
  }
  
  // Dynamically import @xenova/transformers (ES Module)
  if (!transformersModule) {
    transformersModule = await import('@xenova/transformers');
  }
  
  const { AutoTokenizer, AutoModelForSequenceClassification } = transformersModule;
  
  // Load tokenizer and model separately for proper sentence-pair handling
  modelLoading = Promise.all([
    AutoTokenizer.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2', { revision: 'main' }),
    AutoModelForSequenceClassification.from_pretrained('Xenova/ms-marco-MiniLM-L-6-v2', { 
      revision: 'main',
      quantized: false, // Use full precision model for better accuracy
      device: 'cpu' // Explicitly use CPU
    })
  ]).then(([tokenizer, model]) => {
    rerankerTokenizer = tokenizer;
    rerankerModel = model;
    modelLoading = null;
    return { model, tokenizer };
  }).catch(error => {
    modelLoading = null;
    throw error;
  });
  
  return modelLoading;
}

/**
 * Rerank search results using CrossEncoder model (pure JavaScript)
 * @param {string} question - Search question
 * @param {Array<Object>} results - Search results to rerank
 * @returns {Promise<Array<Object>>} - Reranked results with scores
 */
async function rerankResults(question, results) {
  try {
    if (!results || results.length === 0) {
      return results;
    }
    
    // Load model and tokenizer if not already loaded
    const { model, tokenizer } = await loadRerankerModel();
    
    // Extract texts from results
    const texts = results.map(result => {
      const props = result.properties || result;
      return props.text || '';
    });
    
    // Create pairs for reranking: (question, text)
    // For CrossEncoder, we need to tokenize pairs correctly
    const pairs = texts.map(text => [question, text]);
    
    // Get rerank scores using the model
    // Process in batches to avoid memory issues
    const batchSize = 10;
    let scores = [];
    
    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize);
      
      try {
        // Tokenize pairs correctly - tokenizer handles [SEP] token automatically
        // Extract question and text arrays separately for tokenization
        const questions = batch.map(pair => pair[0]);
        const texts_batch = batch.map(pair => pair[1]);
        
        // Tokenize pairs - @xenova/transformers tokenizer accepts pairs as arrays
        // Format: tokenizer(text, text_pair) or tokenizer([text1, text_pair1], ...)
        // Try calling tokenizer with pairs directly
        let encoded;
        try {
          // Try the text_pair parameter format
          encoded = await tokenizer(questions, {
            text_pair: texts_batch,
            padding: true,
            truncation: true,
            return_tensors: 'pt'
          });
        } catch (pairError) {
          // Alternative: tokenize each pair as a formatted string with [SEP] token
          // The tokenizer should recognize [SEP] as a special token
          const formattedPairs = batch.map(pair => `${pair[0]} [SEP] ${pair[1]}`);
          encoded = await tokenizer(formattedPairs, {
            padding: true,
            truncation: true,
            return_tensors: 'pt'
          });
        }
        
        // Run model with tokenized inputs
        const outputs = await model(encoded);
        
        // Extract logits and convert to scores
        // CrossEncoder ms-marco-MiniLM-L-6-v2 has num_labels=1 (regression), so apply sigmoid
        let logits;
        if (outputs.logits && outputs.logits.data) {
          // Extract logits from tensor
          logits = Array.from(outputs.logits.data);
        } else if (Array.isArray(outputs.logits)) {
          logits = outputs.logits;
        } else if (outputs.logits && typeof outputs.logits.get === 'function') {
          // Handle tensor-like object
          logits = Array.from(outputs.logits.get());
        } else {
          // Fallback: try to get raw values
          logits = outputs.logits || [];
        }
        
        // Apply sigmoid to convert logits to scores (0-1 range)
        // sigmoid(x) = 1 / (1 + exp(-x))
        const sigmoid = (x) => 1 / (1 + Math.exp(-x));
        const batchScores = logits.map(logit => sigmoid(logit));
        
        scores = scores.concat(batchScores);
      } catch (modelError) {
        throw modelError;
      }
    }
    
    // Ensure we have the right number of scores
    if (scores.length !== results.length) {
      console.warn(`[reranker] Score count mismatch: ${scores.length} scores for ${results.length} results`);
      // Pad with zeros if needed
      while (scores.length < results.length) {
        scores.push(0);
      }
      scores = scores.slice(0, results.length);
    }
    
    // Attach rerank scores to results
    const rerankedResults = results.map((result, index) => {
      const newResult = { ...result };
      newResult._rerank_score = scores[index] || 0;
      return newResult;
    });
    
    // Sort by rerank score (descending)
    rerankedResults.sort((a, b) => {
      const scoreA = a._rerank_score || 0;
      const scoreB = b._rerank_score || 0;
      return scoreB - scoreA;
    });
    
    return rerankedResults;
  } catch (error) {
    // If reranking fails, return original results
    console.warn('Reranking failed, returning original results:', error.message);
    return results;
  }
}

module.exports = {
  rerankResults
};
