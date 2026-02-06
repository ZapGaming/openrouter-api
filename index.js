const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// FALLBACK SOURCE
const DEFAULT_CSS_URL = "https://raw.githubusercontent.com/warrayquipsome/Chillax/refs/heads/main/chillax.theme.css";

// --- HELPERS ---

async function searchSong(q) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
        const d = await res.json();
        if (!d.linksByPlatform) return { text: "❌ No song found." };
        const meta = d.entitiesByUniqueId[Object.keys(d.entitiesByUniqueId)[0]];
        const p = d.linksByPlatform;
        const links = [
            { n: "Spotify", e: "🟢", u: p.spotify?.url },
            { n: "Apple Music", e: "🍎", u: p.appleMusic?.url },
            { n: "YouTube", e: "📺", u: p.youtube?.url },
            { n: "Tidal", e: "⚫", u: p.tidal?.url }
        ].filter(x => x.u).map(x => `${x.e} [${x.n}](${x.u})`).join(" | ");
        return { text: `🎵 **${meta.title}**\n${links}`, thumb: meta.thumbnailUrl };
    } catch (e) { return { text: "⚠️ Song API error." }; }
}

async function searchGithub(q) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
        const d = await res.json();
        if (!d.items?.[0]) return { text: "❌ Repo not found." };
        const r = d.items[0];
        const stats = `⭐ **${r.stargazers_count}** | 🍴 **${r.forks_count}** | ❗ **${r.open_issues_count}**\n📅 **Last Update:** ${new Date(r.pushed_at).toLocaleDateString()}`;
        return { text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}\n\n*${r.description || "No description."}*`, thumb: r.owner.avatar_url };
    } catch (e) { return { text: "⚠️ GitHub API error." }; }
}

async function editTheme(fileUrl, vibe) {
    try {
        // Fallback logic: Use provided URL or the default GitHub Chillax link
        const cssSource = (fileUrl && fileUrl.startsWith('http')) ? fileUrl : DEFAULT_CSS_URL;
        const cssRes = await fetch(cssSource);
        const originalCSS = await cssRes.text();

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const prompt = `You are a CSS expert. Modify the :root variables in this CSS to match: "${vibe}".
        Return ONLY a JSON object with two keys: "code" (the full css) and "changes" (a short summary). 
        No markdown blocks.`;

        const result = await model.generateContent([prompt, originalCSS]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        // Format for Discord (Handling character limits)
        let displayCode = data.code.length > 1500 ? data.code.substring(0, 1500) + "\n/* ... code truncated ... */" : data.code;

        return { 
            text: `✨ **Theme Edited Successfully!**\n\n**Summary of Changes:**\n${data.changes}\n\n**Updated Code Block:**\n\`\`\`css\n${displayCode}\n\`\`\``
        };
    } catch (e) {
        console.error(e);
        return { text: "❌ **Error:** Failed to process the theme. Check your file or prompt." };
    }
}

// --- MAIN ROUTE ---

app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let responseData = { text: "Invalid Request Type" };

    if (type === 'song') responseData = await searchSong(query);
    else if (type === 'repo') responseData = await searchGithub(query);
    else if (type === 'edit') responseData = await editTheme(fileUrl, prompt);

    res.json(responseData);
});

app.listen(PORT, () => console.log(`Zandybot is live on ${PORT}`));
