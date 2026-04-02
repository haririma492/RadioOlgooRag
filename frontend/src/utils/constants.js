/**
 * Application constants
 */

export const API_ENDPOINTS = {
  BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000',
  SEARCH: '/api/search',
  THEMES: '/api/themes',
  PANELS: '/api/panels',
  HEALTH: '/api/health'
};

export const DEFAULT_VALUES = {
  ALPHA: 0.75,
  TOP_K: 10,
  USE_RERANKER: true
};

export const CONFIG = {
  CACHE_TTL: 3600000 // 1 hour in milliseconds
};
