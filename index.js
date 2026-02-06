const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HF_TOKEN = process.env.HF_TOKEN;

// --- AI LOGIC (Hugging Face) ---
async function getAIResponse(prompt) {
    try {
        const response = await fetch(
            "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
            {
                headers: { 
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: `<s>[INST] You are the Chillax Support AI. Be chill, brief, use emojis, and help with Discord CSS. Answer this: ${prompt} [/INST]`,
                    parameters: { max_new_tokens: 250, temperature: 0.7 }
                }),
            }
        );
        
        const result = await response.json();
        // Hugging Face returns an array: [{ generated_text: "..." }]
        let aiText = result[0]?.generated_text || "";
        
        // Clean up the prompt from the response if it's included
        return aiText.split('[/INST]').pop().trim() || "🌊 (HuggingFace is thinking...)";
    } catch (err) {
        console.error(err);
        return "⚠️ AI error. Make sure HF_TOKEN is correct on Render.";
    }
}

// --- SONG SEARCH LOGIC ---
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
            if (p.soundcloud) msg += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
            return msg;
        }
        return "❌ No song links found. Try a specific name and artist!";
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

// --- MAIN ROUTE (Foolproof) ---
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Chillax Multi-Tool: Online");

    const { type, prompt, query } = req.body;
    let finalOutput = "";

    if (type === 'song') {
        finalOutput = await searchSong(query);
    } else if (type === 'search') {
        finalOutput = await searchGithub(query);
    } else {
        finalOutput = await getAIResponse(prompt || "Yo!");
    }

    // Returning data in multiple formats for BotGhost
    res.json({ 
        text: finalOutput,
        response: { text: finalOutput } 
    });
});

app.listen(PORT, () => console.log(`🚀 Chillax Server Ready on Port ${PORT}`));
