import { AIHelperResponse } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import logger from '../utils/logger';

export const generateMenuItemDetails = async (itemName: string): Promise<AIHelperResponse | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE}/ai/generate`, {
      method: 'POST',
      body: JSON.stringify({ itemName })
    });

    if (!response.ok) {
      logger.error("AI Request failed:", response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error("Gemini AI Service Client Error:", error);
    return null;
  }
};