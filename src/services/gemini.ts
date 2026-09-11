import { GoogleGenAI } from '@google/genai';

// Note: In a real app, API calls to Gemini should be server-side.
// Since the environment provides GEMINI_API_KEY for server only,
// we will create a lightweight Express route to handle this.
// For now, we will setup the frontend to fetch from our API.

export const categorizeTransaction = async (description: string, amount: number): Promise<string> => {
  try {
    const res = await fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, amount }),
    });
    if (!res.ok) throw new Error('Failed to categorize');
    const data = await res.json();
    return data.category;
  } catch (err) {
    console.error('Categorization error:', err);
    return 'General';
  }
};
