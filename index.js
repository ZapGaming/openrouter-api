const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const CHILLAX_INFO = {
    faq_url: "https://chillax.inmoresentum.net/vencordfaq.html",
    creator: "warrayquipsome",
    css_vars: ["--accent-color", "--background-image", "--glass-color"]
};

// Main endpoint
app.post('/ask', async (req, res) => {
    try {
        const { prompt, user, isAutoResponse } = req.body;

        const systemPrompt = `
            You are the Chillax Support AI. 
            FAQ: ${CHILLAX_INFO.faq_url}.
            Tone: Chill, uses emojis.
            ${isAutoResponse ? "This is an automatic chime-in because the user mentioned keywords. Keep it very short and helpful." : "This is a direct question. Give a detailed answer with CSS if needed."}
            If they ask for colors, use rgb() values. Always point to the FAQ for install issues.
        `;

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://render.com",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `User ${user} says: ${prompt}` }
                ]
            })
        });

        const data = await response.json();
        res.json({ reply: data.choices?.[0]?.message?.content || "🌊" });
    } catch (error) {
        res.status(500).json({ reply: "Backend ripple error... try again." });
    }
});

app.listen(PORT, () => console.log(`🚀 Node.js Backend Live on ${PORT}`));
