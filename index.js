const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const FormData = require('form-data');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- API LOGIC ---

async function searchSong(q) {
    const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
    const d = await res.json();
    if (!d.linksByPlatform) return { text: "❌ No song found." };
    const meta = d.entitiesByUniqueId[Object.keys(d.entitiesByUniqueId)[0]];
    const p = d.linksByPlatform;
    const providers = [
        { n: "Spotify", e: "🟢", u: p.spotify?.url },
        { n: "Apple Music", e: "🍎", u: p.appleMusic?.url },
        { n: "YouTube", e: "📺", u: p.youtube?.url },
        { n: "YT Music", e: "🔴", u: p.youtubeMusic?.url },
        { n: "SoundCloud", e: "☁️", u: p.soundcloud?.url },
        { n: "Tidal", e: "⚫", u: p.tidal?.url }
    ].filter(x => x.u).map(x => `${x.e} [${x.n}](${x.u})`).join(" | ");
    return { text: `🎵 **${meta.title}**\n${providers}`, thumb: meta.thumbnailUrl };
}

async function searchGithub(q) {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
    const d = await res.json();
    if (!d.items?.[0]) return { text: "❌ Repo not found." };
    const r = d.items[0];
    const stats = `⭐ ${r.stargazers_count} | ❗ Issues: ${r.open_issues_count}\n🏷️ Topics: ${r.topics.slice(0, 3).join(", ") || "None"}`;
    return { text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}`, thumb: r.owner.avatar_url };
}

async function editTheme(fileUrl, vibe) {
    // We run the AI in a non-blocking way so the API returns a status immediately
    (async () => {
        try {
            const css = await (await fetch(fileUrl)).text();
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
            const prompt = `Return JSON ONLY: {"code": "full css", "changes": "brief list"}. Edit :root for: ${vibe}`;
            const result = await model.generateContent([prompt, css]);
            const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

            const form = new FormData();
            form.append('file', Buffer.from(data.code), { filename: 'edited.theme.css', contentType: 'text/css' });
            form.append('payload_json', JSON.stringify({ content: `✅ **Theme Ready!**\n\n**Changes Made:**\n${data.changes}` }));
            
            await fetch(WEBHOOK_URL, { method: 'POST', body: form, headers: form.getHeaders() });
        } catch (e) { console.error("AI Background Error:", e); }
    })();
    return { text: "✅ Status: Working on it!" };
}

// --- ROUTER ---

app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    if (type === 'song') return res.json(await searchSong(query));
    if (type === 'repo') return res.json(await searchGithub(query));
    if (type === 'edit') return res.json(await editTheme(fileUrl, prompt));
    res.json({ text: "Unknown type" });
});

app.listen(PORT);
