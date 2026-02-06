const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const FormData = require('form-data');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHILLAX_FALLBACK = "https://raw.githubusercontent.com/warrayquipsome/Chillax/refs/heads/main/chillax.theme.css";

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
            { n: "YouTube", e: "📺", u: p.youtube?.url }
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
        const stats = `⭐ **${r.stargazers_count}** | 🍴 **${r.forks_count}** | ❗ **${r.open_issues_count}**`;
        return { text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}\n\n*${r.description || "No description."}*`, thumb: r.owner.avatar_url };
    } catch (e) { return { text: "⚠️ GitHub API error." }; }
}

async function editTheme(fileUrl, vibe) {
    try {
        const cssSource = (fileUrl && fileUrl.startsWith('http')) ? fileUrl : CHILLAX_FALLBACK;
        const cssRes = await fetch(cssSource);
        const originalCSS = await cssRes.text();

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const prompt = `Return JSON ONLY: {"code": "full css", "changes": "brief list"}. Modify :root variables for: ${vibe}`;
        
        const result = await model.generateContent([prompt, originalCSS]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        // SEND FULL FILE VIA WEBHOOK (Bypasses 2000 char limit)
        const form = new FormData();
        form.append('file', Buffer.from(data.code), { 
            filename: 'chillaxedited.theme.css', 
            contentType: 'text/css' 
        });
        
        await fetch(WEBHOOK_URL, { 
            method: 'POST', 
            body: form, 
            headers: form.getHeaders() 
        });

        // Return ONLY the changes summary to BotGhost
        return { 
            text: `✅ **Theme Update Processed!**\n\n**Changes made:**\n${data.changes}\n\n📂 *Check the channel for your new "chillaxedited.theme.css" file!*`
        };
    } catch (e) {
        console.error(e);
        return { text: "❌ **Error:** AI failed to edit theme." };
    }
}

// --- ROUTER ---

app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let out = { text: "Unknown Request" };

    if (type === 'song') out = await searchSong(query);
    else if (type === 'repo') out = await searchGithub(query);
    else if (type === 'edit') out = await editTheme(fileUrl, prompt);

    res.json(out);
});

app.listen(PORT);
