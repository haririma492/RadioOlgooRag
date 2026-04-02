/**
 * API configuration
 */
import { API_ENDPOINTS } from '../utils/constants';

export const API_BASE_URL = API_ENDPOINTS.BASE_URL;

export const getApiUrl = (endpoint) => {
  return `${API_BASE_URL}${endpoint}`;
};
