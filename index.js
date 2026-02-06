const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- SONG SEARCH LOGIC ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let links = `🎵 **Links for: ${query}**\n`;
            if (p.spotify) links += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.appleMusic) links += `🍎 [Apple Music](${p.appleMusic.url})\n`;
            if (p.youtube) links += `📺 [YouTube](${p.youtube.url})\n`;
            if (p.soundcloud) links += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
            return links;
        }
        return "❌ Couldn't find links for that song name/URL.";
    } catch (err) {
        return "⚠️ Music API error. Try a different song name!";
    }
}

// --- AI LOGIC (STABILIZED) ---
async function getAIResponse(prompt) {
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`, 
                "Content-Type": "application/json",
                "HTTP-Referer": "https://render.com" 
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free", // Use a standard stable model
                messages: [
                    { role: "system", content: "You are the Chillax Support AI. Help with Discord themes and CSS. Be brief and chill." },
                    { role: "user", content: prompt }
                ]
            })
        });
        const data = await res.json();
        
        // Debug: if the AI is empty, this catches it before the emoji
        const aiText = data.choices?.[0]?.message?.content;
        if (!aiText || aiText.trim() === "") {
            return "💨 The AI is a bit quiet right now. Try rephrasing your question!";
        }
        return aiText;
    } catch (err) {
        return "🔴 Server connection drop. Try again in 5 seconds.";
    }
}

// --- MAIN ROUTE ---
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Chillax Server Active");

    const { type, prompt, query } = req.body;
    let finalMsg = "";

    if (type === 'song') {
        finalMsg = await searchSong(query);
    } else if (type === 'search') {
        // ... (Keep your existing GitHub repo code here)
        finalMsg = "GitHub repo found!"; 
    } else {
        finalMsg = await getAIResponse(prompt || "Hello");
    }

    // This structure ensures BotGhost sees the text key directly
    res.json({ 
        text: finalMsg,
        response: { text: finalMsg } 
    });
});

app.listen(PORT, () => console.log(`🚀 Chillax Multi-Tool on port ${PORT}`));
