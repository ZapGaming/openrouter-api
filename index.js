const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// --- AI LOGIC (GROQ) ---
async function getAIResponse(prompt) {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: "You are the Chillax Support AI. Be chill, brief, and help with Discord CSS. Use emojis." },
                    { role: "user", content: prompt }
                ]
            })
        });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "🌊 (Empty response from the void)";
    } catch (err) {
        return "⚠️ AI error. Check your GROQ_API_KEY on Render.";
    }
}

// --- SONG SEARCH LOGIC (Songlink) ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let msg = `🎵 **Links for: ${query}**\n`;
            if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.youtube) msg += `📺 [YouTube](${p.youtube.url})\n`;
            if (p.appleMusic) msg += `🍎 [Apple Music](${p.appleMusic.url})\n`;
            return msg;
        }
        return "❌ No song links found.";
    } catch (err) { return "⚠️ Music API error."; }
}

// --- GITHUB REPO LOGIC ---
async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items?.[0]) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n⭐ Stars: ${repo.stargazers_count}\n📝 ${repo.description || "No description."}`;
        }
        return "❌ No repo found.";
    } catch (err) { return "⚠️ GitHub API error."; }
}

// --- MAIN ROUTE ---
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Chillax API is Live!");

    const { type, prompt, query } = req.body;
    let finalOutput = "";

    if (type === 'song') finalOutput = await searchSong(query);
    else if (type === 'search') finalOutput = await searchGithub(query);
    else finalOutput = await getAIResponse(prompt || "Yo!");

    // Double-key return to fix [object Object]
    res.json({ 
        text: finalOutput,
        response: { text: finalOutput } 
    });
});

app.listen(PORT, () => console.log(`🚀 Chillax Server running on ${PORT}`));
