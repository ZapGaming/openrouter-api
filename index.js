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

// ... (Keep the top part of your file the same)

async function editTheme(fileUrl, vibe) {
    // 1. Validation check - crucial for the "Absolute URL" error
    if (!WEBHOOK_URL || !WEBHOOK_URL.startsWith('http')) {
        console.error("❌ ERROR: DISCORD_WEBHOOK_URL is missing or invalid in Render Environment Variables.");
        return { success: false, error: "Configuration Error" };
    }

    // We run the AI in a non-blocking way
    (async () => {
        try {
            console.log("🎨 AI starting theme edit for vibe:", vibe);
            const cssRes = await fetch(fileUrl);
            const css = await cssRes.text();

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Return JSON ONLY: {"code": "full css", "changes": "brief list"}. Edit :root variables for: ${vibe}`;
            
            const result = await model.generateContent([prompt, css]);
            const responseText = result.response.text().replace(/```json|```/g, "").trim();
            const data = JSON.parse(responseText);

            const form = new FormData();
            form.append('file', Buffer.from(data.code), { filename: 'edited.theme.css', contentType: 'text/css' });
            form.append('payload_json', JSON.stringify({ 
                content: `✅ **Theme Ready!**\n\n**Changes Made:**\n${data.changes}` 
            }));
            
            const discordRes = await fetch(WEBHOOK_URL, { 
                method: 'POST', 
                body: form, 
                headers: form.getHeaders() 
            });

            if (!discordRes.ok) {
                console.error("❌ Discord Webhook failed:", await discordRes.text());
            } else {
                console.log("🚀 Theme sent to Discord successfully.");
            }
        } catch (e) { 
            console.error("🚨 AI Background Error:", e.message); 
        }
    })();

    return { text: "⏳ **Processing... Your theme will be ready and sent to this channel shortly!**" };
}

// --- UPDATED ROUTER ---
app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    
    // Log the request type for easier debugging in Render
    console.log(`📩 Received Request Type: ${type}`);

    if (type === 'song') return res.json(await searchSong(query));
    if (type === 'repo') return res.json(await searchGithub(query));
    if (type === 'edit') {
        const response = await editTheme(fileUrl, prompt);
        return res.json(response);
    }
    
    res.json({ text: "Unknown request type received." });
});

app.listen(PORT, () => console.log(`Zandybot Heartbeat: Online on Port ${PORT}`));
