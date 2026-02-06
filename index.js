const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const CHILLAX_FALLBACK = "https://raw.githubusercontent.com/warrayquipsome/Chillax/refs/heads/main/chillax.theme.css";

// --- 1. DEEP SONG SEARCH ---
async function searchSong(q) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
        const d = await res.json();
        if (!d.linksByPlatform) return { text: "❌ No song found." };
        const meta = d.entitiesByUniqueId[Object.keys(d.entitiesByUniqueId)[0]];
        const p = d.linksByPlatform;
        const providers = [
            { n: "Spotify", e: "🟢", u: p.spotify?.url },
            { n: "Apple", e: "🍎", u: p.appleMusic?.url },
            { n: "YouTube", e: "📺", u: p.youtube?.url },
            { n: "Tidal", e: "⚫", u: p.tidal?.url },
            { n: "SoundCloud", e: "☁️", u: p.soundcloud?.url }
        ].filter(x => x.u).map(x => `${x.e} [${x.n}](${x.u})`).join(" | ");
        return { text: `🎵 **${meta.title}** by ${meta.artistName}\n${providers}`, thumb: meta.thumbnailUrl };
    } catch (e) { return { text: "⚠️ Song API error." }; }
}

// --- 2. DEEP REPO STATS ---
async function searchGithub(q) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
        const d = await res.json();
        if (!d.items?.[0]) return { text: "❌ Repo not found." };
        const r = d.items[0];
        const stats = `⭐ **${r.stargazers_count}** | 🍴 **${r.forks_count}** | ❗ **${r.open_issues_count}**\n🏷️ **Topics:** ${r.topics.slice(0, 3).join(", ") || "None"}`;
        return { text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}\n\n*${r.description}*`, thumb: r.owner.avatar_url };
    } catch (e) { return { text: "⚠️ GitHub API error." }; }
}

// --- 3. THEME EDIT ENGINE ---
async function editTheme(fileUrl, vibe) {
    try {
        const cssSource = (fileUrl && fileUrl.startsWith('http')) ? fileUrl : CHILLAX_FALLBACK;
        const cssRes = await fetch(cssSource);
        const originalCSS = await cssRes.text();

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Return JSON ONLY: {"code": "full css string", "changes": "summary"}. Edit :root for: ${vibe}`;
        
        const result = await model.generateContent([prompt, originalCSS]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        // Limit code display to stay under Discord's 2000 char limit
        const snippet = data.code.substring(0, 1200);
        
        return { 
            text: `✨ **Theme Edited!**\n\n**Changes Made:**\n${data.changes}\n\n**Updated Variables Snippet:**\n\`\`\`css\n${snippet}\n...\n\`\`\`\n⚠️ *Full code truncated to avoid Discord limits.*`
        };
    } catch (e) {
        return { text: "❌ **Error:** AI failed to parse theme JSON." };
    }
}

// --- ROUTER ---
app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let out = { text: "Unknown Type" };
    if (type === 'song') out = await searchSong(query);
    if (type === 'repo') out = await searchGithub(query);
    if (type === 'edit') out = await editTheme(fileUrl, prompt);
    res.json(out);
});

app.listen(PORT);
