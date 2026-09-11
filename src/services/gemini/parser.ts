import { GoogleGenAI } from '@google/genai';
import { Transaction } from '../../types';

// In a real app with strict security, this would be a Firebase Cloud Function
// or the Express backend we set up. For simplicity and since we have an Express
// backend running, we'll use our API endpoint.

export const categorizeAndParseTransaction = async (description: string, amount: number): Promise<Partial<Transaction>> => {
  try {
    const res = await fetch('/api/parse-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, amount }),
    });
    
    if (!res.ok) {
      throw new Error('Failed to parse transaction');
    }
    
    const data = await res.json();
    return data;
  } catch (error) {
    console.error('Error parsing transaction with Gemini:', error);
    // Fallback if API fails
    return {
      description,
      amount,
      type: 'expense'
    };
  }
};
