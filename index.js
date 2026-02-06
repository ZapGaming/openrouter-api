const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// --- Logic: Song Search (Odesli) ---
async function searchSong(query) {
    try {
        // Use Odesli's public API to find music links
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let responseText = `🎵 **Results for your search:**\n`;
            if (p.spotify) responseText += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.appleMusic) responseText += `🍎 [Apple Music](${p.appleMusic.url})\n`;
            if (p.youtube) responseText += `📺 [YouTube](${p.youtube.url})\n`;
            if (p.soundcloud) responseText += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
            return responseText;
        }
        
        // If not a link, Odesli works better with a platform-specific search link first, 
        // but for a foolproof version, we'll tell them to provide a name or link.
        return "❌ Could not find that song. Try pasting a Spotify or YouTube link for a full list of platforms!";
    } catch (err) {
        return "⚠️ Music Search is currently wavy. Try again later.";
    }
}

// --- Logic: GitHub & AI (Updated) ---
async function getAIResponse(prompt, user) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "meta-llama/llama-3.1-8b-instruct:free",
            messages: [{ role: "system", content: "You are the Chillax Support AI. Be chill." }, { role: "user", content: prompt }]
        })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "🌊";
}

// --- The Main Route ---
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Online.");

    const { type, prompt, query, user } = req.body;
    let result = "";

    if (type === 'song') {
        result = await searchSong(query);
    } else if (type === 'search') {
        // ... (Insert GitHub logic from previous step here)
        result = "Repo search logic active."; 
    } else {
        result = await getAIResponse(prompt, user);
    }

    // This specific return structure fixes [object Object]
    res.json({ 
        response: { text: result }, 
        text: result 
    });
});

app.listen(PORT, () => console.log(`🚀 Multi-Tool Live on ${PORT}`));
