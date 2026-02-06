const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const FormData = require('form-data');
const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- 1. DEEP SONG SEARCH (ALL PROVIDERS) ---
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
        { n: "Tidal", e: "⚫", u: p.tidal?.url },
        { n: "Deezer", e: "🟣", u: p.deezer?.url },
        { n: "Amazon", e: "📦", u: p.amazonMusic?.url }
    ].filter(x => x.u).map(x => `${x.e} [${x.n}](${x.u})`).join(" | ");

    return { text: `🎵 **${meta.title}** by ${meta.artistName}\n${providers}`, thumb: meta.thumbnailUrl };
}

// --- 2. DEEP REPO STATS ---
async function searchGithub(q) {
    const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
    const d = await res.json();
    if (!d.items?.[0]) return { text: "❌ Repo not found." };
    const r = d.items[0];
    
    const stats = [
        `⭐ **Stars:** ${r.stargazers_count}`,
        `🍴 **Forks:** ${r.forks_count}`,
        `❗ **Issues:** ${r.open_issues_count}`,
        `📜 **License:** ${r.license?.name || "None"}`,
        `🏷️ **Topics:** ${r.topics.slice(0, 5).join(", ") || "None"}`
    ].join(" | ");

    return { text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}\n📝 *${r.description || "No description."}*`, thumb: r.owner.avatar_url };
}

// --- 3. THEME EDIT ENGINE ---
async function editTheme(fileUrl, vibe) {
    try {
        const css = await (await fetch(fileUrl)).text();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Return JSON ONLY: {"code": "full css string", "changes": "summary"}. Edit :root variables for: ${vibe}`;
        const result = await model.generateContent([prompt, css]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        const form = new FormData();
        form.append('file', Buffer.from(data.code), { filename: 'chillax.theme.css', contentType: 'text/css' });
        form.append('payload_json', JSON.stringify({ content: `✨ **Theme Edited!**\n\n**Summary:**\n${data.changes}` }));
        
        await fetch(WEBHOOK_URL, { method: 'POST', body: form, headers: form.getHeaders() });
        return { success: true, changes: data.changes };
    } catch (e) { return { success: false }; }
}

app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    if (type === 'song') return res.json(await searchSong(query));
    if (type === 'repo') return res.json(await searchGithub(query));
    if (type === 'edit') {
        const resData = await editTheme(fileUrl, prompt);
        return res.json({ text: resData.success ? `✅ **Success!** File sent to channel.\n\n**Changes:**\n${resData.changes}` : "❌ Error." });
    }
});

app.listen(process.env.PORT || 3000);
