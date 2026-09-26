const { GoogleGenAI, Type } = require("@google/genai");
const logger = require('../utils/logger.cjs');

// ARCH-H5: Instantiate GoogleGenAI once at module load rather than per-request.
// The SDK client is stateless between requests; recreating it on every call wastes
// memory allocations and initialization overhead.
const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

const generateCategory = async (req, res) => {
    const { itemName } = req.body;

    if (!genAI) {
        logger.error("Gemini API Key is missing on server.");
        return res.status(500).json({ error: "AI service not configured" });
    }

    if (!itemName) return res.status(400).json({ error: "Item name is required" });

    try {
        const response = await genAI.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: `Generate a suitable category (e.g., 'Main Course', 'Beverage', 'Snack', 'Salad', 'Dessert') for a cafeteria menu item named "${itemName}".`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { category: { type: Type.STRING } },
                    required: ["category"]
                }
            }
        });

        const text = response.text();
        if (text) res.json(JSON.parse(text));
        else res.status(500).json({ error: "No response from AI" });
    } catch (error) {
        logger.error("Gemini AI error", error);
        res.status(500).json({ error: "AI generation failed" });
    }
};

module.exports = {
    generateCategory
};
