/**
 * API service
 * Handles all API calls to the backend
 */
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/constants';

const api = axios.create({
  baseURL: API_ENDPOINTS.BASE_URL,
  timeout: 60000, // 60 seconds
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for debugging and error handling
api.interceptors.response.use(
  (response) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('API Response:', response.config.url, response.status, response.data);
    }
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.response?.data || error.message);
    
    // Provide user-friendly error messages
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.error || error.response.data?.message || 'An error occurred';
      return Promise.reject(new Error(message));
    } else if (error.request) {
      // Request made but no response
      return Promise.reject(new Error('Network error. Please check your connection.'));
    } else {
      // Something else happened
      return Promise.reject(new Error(error.message || 'An unexpected error occurred'));
    }
  }
);

/**
 * Search for results
 * @param {string} query - Search question
 * @param {string} theme - Selected theme filter
 * @param {string} panel - Selected panel filter
 * @returns {Promise<Object>} - Search results
 */
export const search = async (query, theme = 'All', panel = 'All') => {
  try {
    const response = await api.post(API_ENDPOINTS.SEARCH, {
      question: query,
      theme: theme,
      panel: panel
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all themes
 * @returns {Promise<Array<string>>} - List of themes
 */
export const getThemes = async () => {
  try {
    const response = await api.get(API_ENDPOINTS.THEMES);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get panels, optionally filtered by theme
 * @param {string} theme - Theme to filter by (optional)
 * @returns {Promise<Array>} - List of panels
 */
export const getPanels = async (theme = null) => {
  try {
    const url = theme && theme !== 'All' 
      ? `${API_ENDPOINTS.PANELS}?theme=${encodeURIComponent(theme)}`
      : API_ENDPOINTS.PANELS;
    const response = await api.get(url);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Health check
 * @returns {Promise<Object>} - Health status
 */
export const healthCheck = async () => {
  try {
    const response = await api.get(API_ENDPOINTS.HEALTH);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export default api;
