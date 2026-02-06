const express = require('express');
const app = express();

// Middleware to parse JSON bodies from BotGhost
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Chillax Theme Knowledge Configuration
const CHILLAX_INFO = {
    faq_url: "https://chillax.inmoresentum.net/vencordfaq.html",
    creator: "warrayquipsome",
    vibe: "Modern, Glassmorphism, Clean, Purple/Blue aesthetics",
    css_vars: [
        "--accent-color", 
        "--background-image", 
        "--glass-color", 
        "--text-normal",
        "--font-primary: 'Poppins', sans-serif;"
    ]
};

app.post('/ask', async (req, res) => {
    try {
        const { prompt, user } = req.body;

        if (!prompt) {
            return res.status(400).json({ reply: "Yo! You forgot to ask something." });
        }

        console.log(`💬 Request from ${user}: ${prompt}`);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": "https://render.com",
                "X-Title": "Chillax Support Node",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [
                    {
                        role: "system",
                        content: `You are the Chillax Support Bot. 
                        Context:
                        - Theme: Chillax (Discord theme for Vencord/BetterDiscord).
                        - FAQ Link: ${CHILLAX_INFO.faq_url}
                        - Creator: ${CHILLAX_INFO.creator}.
                        - Tone: Extremely chill, friendly, uses emojis (🌊, 🧊, ✨).
                        
                        Instructions:
                        1. If the user asks for installation help, always point them to: ${CHILLAX_INFO.faq_url}.
                        2. If they ask for a color (e.g., "blue", "neon pink"), provide a CSS snippet using: --accent-color: rgb(r, g, b);
                        3. Encourage the use of the 'Poppins' font for the best look.
                        4. Keep it concise. Don't be a robot; be a peer.`
                    },
                    { role: "user", content: `User ${user} asks: ${prompt}` }
                ]
            })
        });

        const data = await response.json();
        const aiMessage = data.choices?.[0]?.message?.content || "My brain is on standby. Try again?";

        // Send response back to BotGhost
        res.json({ reply: aiMessage });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ reply: "The server is feeling a bit un-chill. Try again later!" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Chillax API listening on port ${PORT}`);
});
