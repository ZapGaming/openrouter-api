const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- ENHANCED SONG SEARCH (WITH METADATA) ---
async function searchSong(q) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
        const d = await res.json();
        if (!d.linksByPlatform) return "❌ No song found.";

        const p = d.linksByPlatform;
        // Get metadata from the first available platform (usually Spotify or YT)
        const firstKey = Object.keys(d.entitiesByUniqueId)[0];
        const meta = d.entitiesByUniqueId[firstKey];

        let msg = `🎵 **${meta.title}** by **${meta.artistName}**\n`;
        if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
        if (p.appleMusic) msg += `🍎 [Apple](${p.appleMusic.url})\n`;
        if (p.youtubeMusic) msg += `🔴 [YT Music](${p.youtubeMusic.url})\n`;
        if (p.soundcloud) msg += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
        if (p.tidal) msg += `⚫ [Tidal](${p.tidal.url})\n`;
        
        return { text: msg, thumb: meta.thumbnailUrl };
    } catch (e) { return { text: "⚠️ Music API error." }; }
}

// --- ENHANCED GITHUB SEARCH (WITH STATS) ---
async function searchGithub(q) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
        const d = await res.json();
        if (!d.items?.[0]) return { text: "❌ No repo found." };

        const r = d.items[0];
        
        // Parallel fetch for Languages and Contributors
        const [langRes, contRes] = await Promise.all([
            fetch(r.languages_url),
            fetch(`${r.contributors_url}?per_page=1`)
        ]);
        
        const langs = await langRes.json();
        const topCont = await contRes.json();
        
        const langList = Object.keys(langs).slice(0, 3).join(", ") || "Unknown";
        const topUser = topCont[0] ? topCont[0].login : "N/A";

        let msg = `📂 **[${r.full_name}](${r.html_url})**\n`;
        msg += `⭐ **Stars:** ${r.stargazers_count.toLocaleString()} | 🍴 **Forks:** ${r.forks_count}\n`;
        msg += `💻 **Languages:** ${langList}\n`;
        msg += `👑 **Top Contributor:** ${topUser}\n`;
        msg += `📝 *${r.description || "No description provided."}*`;

        return { text: msg, thumb: r.owner.avatar_url };
    } catch (e) { return { text: "⚠️ GitHub error." }; }
}

// --- AI THEME EDITOR ---
async function processAITheme(fileUrl, prompt) {
    try {
        const cssRes = await fetch(fileUrl);
        const originalCSS = await cssRes.text();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
            `Modify ONLY the :root variables in this CSS for the vibe: "${prompt}". Return ONLY the code.`,
            originalCSS
        ]);
        return result.response.text().replace(/```css|```/g, "");
    } catch (e) { return null; }
}

// --- MAIN ROUTE ---
app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let result = { text: "" };

    if (type === 'edit-theme') {
        const newCSS = await processAITheme(fileUrl, prompt);
        if (newCSS) {
            const formData = new FormData();
            formData.append('file', new Blob([newCSS], { type: 'text/css' }), 'custom.theme.css');
            formData.append('payload_json', JSON.stringify({ content: "✨ **AI Update Ready!**" }));
            await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
            return res.json({ text: "✅ Check the channel!" });
        }
        result.text = "❌ AI Error.";
    } 
    else if (type === 'song') result = await searchSong(query);
    else if (type === 'github') result = await searchGithub(query);
    
    // Return formatted for BotGhost
    res.json({
        text: result.text,
        embeds: result.thumb ? [{ thumbnail: { url: result.thumb }, color: 0x5865F2 }] : []
    });
});

app.listen(PORT);
