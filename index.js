const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const FormData = require('form-data');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- DEEP SONG SEARCH: ALL PLATFORMS ---
async function searchSong(q) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
        const d = await res.json();
        if (!d.linksByPlatform) return { text: "❌ No song found." };

        const firstKey = Object.keys(d.entitiesByUniqueId)[0];
        const meta = d.entitiesByUniqueId[firstKey];
        const p = d.linksByPlatform;

        // Map all major platforms supported by Odesli/Songlink
        const platforms = [
            { name: "Spotify", emoji: "🟢", link: p.spotify?.url },
            { name: "Apple Music", emoji: "🍎", link: p.appleMusic?.url },
            { name: "YouTube", emoji: "📺", link: p.youtube?.url },
            { name: "YT Music", emoji: "🔴", link: p.youtubeMusic?.url },
            { name: "SoundCloud", emoji: "☁️", link: p.soundcloud?.url },
            { name: "Tidal", emoji: "⚫", link: p.tidal?.url },
            { name: "Amazon", emoji: "📦", link: p.amazonMusic?.url },
            { name: "Deezer", emoji: "🟣", link: p.deezer?.url },
            { name: "Pandora", emoji: "⚪", link: p.pandora?.url }
        ];

        let linksMsg = platforms.filter(plat => plat.link).map(plat => `${plat.emoji} [${plat.name}](${plat.link})`).join(" | ");

        return {
            text: `🎵 **${meta.title}** - ${meta.artistName}\n${linksMsg}`,
            thumb: meta.thumbnailUrl
        };
    } catch (e) { return { text: "⚠️ Music fetch failed." }; }
}

// --- DEEP REPO SEARCH: TOPICS & STATS ---
async function searchGithub(q) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
        const d = await res.json();
        if (!d.items?.[0]) return { text: "❌ Repo not found." };

        const r = d.items[0];
        
        // Detailed Stats
        const topics = r.topics.length > 0 ? r.topics.slice(0, 5).map(t => `\`${t}\``).join(" ") : "None";
        const updated = new Date(r.pushed_at).toLocaleDateString();

        let msg = `📂 **[${r.full_name}](${r.html_url})**\n`;
        msg += `⭐ **Stars:** ${r.stargazers_count} | 🍴 **Forks:** ${r.forks_count}\n`;
        msg += `🛠️ **Topics:** ${topics}\n`;
        msg += `❗ **Open Issues:** ${r.open_issues_count} | 📅 **Last Push:** ${updated}\n`;
        msg += `📝 *${r.description || "No description."}*`;

        return { text: msg, thumb: r.owner.avatar_url };
    } catch (e) { return { text: "⚠️ GitHub API Error." }; }
}

// --- AI THEME EDITOR (UNCHANGED LOGIC) ---
async function smartEditTheme(fileUrl, userVibe) {
    try {
        const cssRes = await fetch(fileUrl);
        const originalCSS = await cssRes.text();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const systemPrompt = `Return JSON ONLY: {"code": "full css here", "changes": "summary here"}. Modify :root for: ${userVibe}`;
        const result = await model.generateContent([systemPrompt, originalCSS]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        const form = new FormData();
        form.append('file', Buffer.from(data.code), { filename: 'edited.theme.css', contentType: 'text/css' });
        form.append('payload_json', JSON.stringify({
            content: `✨ **Zandybot AI Update**\n\n**Changes:**\n${data.changes}`
        }));

        await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });
        return true;
    } catch (e) { return false; }
}

// --- ROUTING ---
app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let result = { text: "" };

    if (type === 'edit-theme') {
        const success = await smartEditTheme(fileUrl, prompt);
        return res.json({ text: success ? "✅ Check channel!" : "❌ Edit failed." });
    } 
    if (type === 'song') result = await searchSong(query);
    if (type === 'github') result = await searchGithub(query);

    res.json({
        text: result.text,
        embeds: result.thumb ? [{ thumbnail: { url: result.thumb }, color: 0x5865F2 }] : []
    });
});

app.listen(PORT);
