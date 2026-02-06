const express = require('express');
const app = express();

// This is critical for reading the JSON BotGhost sends
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- Logic Functions ---

async function getAIResponse(prompt, user) {
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://render.com"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [
                    { 
                        role: "system", 
                        content: "You are the Chillax Support AI. Keep it chill, use emojis, and help with CSS. FAQ: https://chillax.inmoresentum.net/vencordfaq.html" 
                    },
                    { role: "user", content: `User ${user} asks: ${prompt}` }
                ]
            })
        });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "🌊 Thinking... try again!";
    } catch (err) {
        return "⚠️ AI Connection Error.";
    }
}

async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n⭐ **Stars:** ${repo.stargazers_count}\n📝 ${repo.description || "No description."}`;
        }
        return "❌ No repo found.";
    } catch (err) {
        return "⚠️ GitHub API Error.";
    }
}

// --- Routes ---

// 1. Browser Status Check (GET /)
app.get('/', (req, res) => {
    res.send("✅ Chillax API is Online and Awake!");
});

// 2. The Main Command Endpoint (POST /)
app.post('/', async (req, res) => {
    console.log("📩 Request Received:", req.body);
    
    const { type, prompt, user, query } = req.body;
    let finalOutput = "";

    if (type === 'search') {
        finalOutput = await searchGithub(query);
    } else {
        finalOutput = await getAIResponse(prompt || "Hello", user || "User");
    }

    // DOUBLE-KEY RESPONSE: This fixes the [object Object] error
    // We provide the data in multiple formats so BotGhost can't miss it
    res.json({ 
        response: finalOutput, 
        text: finalOutput,
        reply: finalOutput 
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Chillax Server running on port ${PORT}`);
});
