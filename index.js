const express = require('express');
const app = express();

// Essential: This must be here to read the data BotGhost sends
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 1. The Brain: OpenRouter Function
async function getAIResponse(prompt, user) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://render.com", // Required by OpenRouter
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [
                    {
                        role: "system",
                        content: `You are the Chillax Support AI for the Discord theme by warrayquipsome. 
                        FAQ: https://chillax.inmoresentum.net/vencordfaq.html
                        Style: Very chill, helpful, uses emojis. 
                        Rules: If asked for colors, give CSS rgb() snippets. Point to FAQ for bugs/install.`
                    },
                    { role: "user", content: `User ${user} asks: ${prompt}` }
                ]
            })
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "🌊 Thinking... try again in a sec.";
    } catch (err) {
        console.error("AI Error:", err);
        return "⚠️ My connection to the brain-cloud is wavy right now.";
    }
}

// 2. The Foolproof Route: Matches EVERY path (/, /ask, etc.)
app.all('*', async (req, res) => {
    // Log for debugging (Check Render Logs)
    console.log(`📩 Request: ${req.method} ${req.path}`);

    // Ignore GET requests (like browsers visiting the site)
    if (req.method !== 'POST') {
        return res.status(200).send("Chillax AI is online and waiting for POST requests.");
    }

    const { prompt, user } = req.body;
    
    // Safety check if prompt is missing
    if (!prompt) {
        return res.json({ reply: "I'm here! What's your question about Chillax?" });
    }

    const answer = await getAIResponse(prompt, user || "User");
    
    // Always return a JSON object with 'reply'
    res.json({ reply: answer });
});

app.listen(PORT, () => {
    console.log(`🚀 Chillax Foolproof Server live on port ${PORT}`);
});
