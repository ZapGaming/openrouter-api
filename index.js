const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const CHILLAX_FALLBACK = "https://raw.githubusercontent.com/warrayquipsome/Chillax/refs/heads/main/chillax.theme.css";
const FAQ_LINK = "https://github.com/warrayquipsome/Chillax/blob/main/FAQ.md";

// --- 1. CLEAN SONG SEARCH ---
async function searchSong(q) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(q)}&userCountry=US`);
        const d = await res.json();
        if (!d.linksByPlatform) return { text: "❌ No song found." };
        
        const firstKey = Object.keys(d.entitiesByUniqueId)[0];
        const meta = d.entitiesByUniqueId[firstKey];
        const p = d.linksByPlatform;

        const platforms = [
            { n: "Spotify", e: "🟢", u: p.spotify?.url },
            { n: "Apple", e: "🍎", u: p.appleMusic?.url },
            { n: "YouTube", e: "📺", u: p.youtube?.url },
            { n: "SoundCloud", e: "☁️", u: p.soundcloud?.url }
        ].filter(x => x.u).map(x => `${x.e} [${x.n}](${x.u})`).join(" **|** ");

        return { 
            text: `🎵 **${meta.title}**\n👤 *${meta.artistName}*\n\n${platforms}`, 
            thumb: meta.thumbnailUrl 
        };
    } catch (e) { return { text: "⚠️ Song API error." }; }
}

// --- 2. CLEAN REPO STATS ---
async function searchGithub(q) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=1`);
        const d = await res.json();
        if (!d.items?.[0]) return { text: "❌ Repo not found." };
        
        const r = d.items[0];
        const stats = `⭐ **${r.stargazers_count.toLocaleString()}** stars  •  🍴 **${r.forks_count.toLocaleString()}** forks`;
        const topics = r.topics.length ? `\n🏷️ \`${r.topics.slice(0, 3).join("`, `")}\`` : "";

        return { 
            text: `📂 **[${r.full_name}](${r.html_url})**\n${stats}${topics}\n\n> ${r.description || "No description provided."}`, 
            thumb: r.owner.avatar_url 
        };
    } catch (e) { return { text: "⚠️ GitHub API error." }; }
}

// --- 3. THEME EDIT ENGINE (DIFF STYLE) ---
async function editTheme(fileUrl, vibe) {
    try {
        const cssSource = (fileUrl && fileUrl.startsWith('http')) ? fileUrl : CHILLAX_FALLBACK;
        const cssRes = await fetch(cssSource);
        const originalCSS = await cssRes.text();

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `
            You are a Discord CSS expert for Vencord themes. 
            Modify the :root variables in the provided CSS to match this vibe: "${vibe}".
            
            Return ONLY a JSON object:
            {
              "changes": "A string containing a list of exactly what was changed in this format: 'Line [Number]: [Variable Name] ([Old Value] -> [New Value])'.",
            }
            Do not include markdown backticks in the JSON.
        `;
        
        const result = await model.generateContent([prompt, originalCSS]);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, ""));

        // Use the changes field and append the FAQ
        const responseText = `✨ **Theme Edited!**\n\n**Detailed Changes:**\n${data.changes}\n\n💡 *Need more help? Check the [Chillax FAQ](${FAQ_LINK})*`;

        return { text: responseText };
    } catch (e) {
        console.error(e);
        return { text: "❌ **Error:** AI failed to generate the change log. Try a simpler vibe." };
    }
}

// --- ROUTER ---
app.post('/', async (req, res) => {
    const { type, query, fileUrl, prompt } = req.body;
    let out = { text: "Unknown Request Type" };
    
    if (type === 'song') out = await searchSong(query);
    if (type === 'repo') out = await searchGithub(query);
    if (type === 'edit') out = await editTheme(fileUrl, prompt);
    
    res.json(out);
});

app.listen(PORT, () => console.log(`Server active on port ${PORT}`));
