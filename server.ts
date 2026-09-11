import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/parse-transaction', async (req, res) => {
    try {
      const { description, amount } = req.body;
      const key = process.env.GEMINI_API_KEY;
      
      if (!key) {
        return res.status(500).json({ error: 'GEMINI_API_KEY missing' });
      }

      const ai = new GoogleGenAI({ apiKey: key });
      
      const schema: Schema = {
        type: Type.OBJECT,
        properties: {
          description: {
            type: Type.STRING,
            description: "A clean, concise title for the transaction",
          },
          type: {
            type: Type.STRING,
            enum: ["expense", "income", "transfer"],
            description: "The type of transaction",
          },
          categoryName: {
            type: Type.STRING,
            description: "Suggested category name (e.g., Comida, Transporte, Hogar, Ocio)",
          },
          amount: {
            type: Type.NUMBER,
            description: "The parsed numerical amount",
          },
          isRecurring: {
            type: Type.BOOLEAN,
            description: "Whether this sounds like a recurring subscription",
          }
        },
        required: ["description", "type", "categoryName", "amount", "isRecurring"],
      };

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Analyze this transaction input from a user: "${description}". The amount provided is ${amount}. Extract the structured information. Keep descriptions very concise. Default to expense unless it sounds like income or transferring money.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      if (!response.text) throw new Error("No response from Gemini");
      
      const result = JSON.parse(response.text);
      res.json(result);
    } catch (error) {
      console.error('Categorize error:', error);
      res.status(500).json({ error: 'Failed to categorize' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
