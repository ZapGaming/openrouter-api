const express = require('express');
const app = express();

// Required to read BotGhost's JSON
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// --- GITHUB REPO SEARCH ---
async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items?.[0]) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n⭐ Stars: ${repo.stargazers_count}\n📝 ${repo.description || "No description."}`;
        }
        return `❌ No repo found for "${query}"`;
    } catch (err) { return "⚠️ GitHub Error."; }
}

// --- MOVIE/SHOW SEARCH (OMDb) ---
async function searchOMDb(query) {
    try {
        const res = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.Response === "True") {
            return `**${data.Type.toUpperCase()}: ${data.Title}** (${data.Year})\n⭐ IMDb: ${data.imdbRating}\n📝 ${data.Plot}`;
        }
        return `❌ Movie/Show "${query}" not found.`;
    } catch (err) { return "⚠️ OMDb Error."; }
}

// --- SONG SEARCH ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let msg = `🎵 **Links for: ${query}**\n`;
            if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.youtube) msg += `📺 [YouTube](${p.youtube.url})\n`;
            return msg;
        }
        return "❌ Song not found.";
    } catch (err) { return "⚠️ Music Error."; }
}

// --- MAIN ROUTE ---
app.post('/', async (req, res) => {
    // DEBUG: This prints in your Render Logs
    console.log("Incoming Data:", req.body);

    const { type, query } = req.body;
    let result = "";

    // Check type and query
    if (type === 'github') result = await searchGithub(query);
    else if (type === 'watch') result = await searchOMDb(query);
    else if (type === 'song') result = await searchSong(query);
    else result = "❌ Error: Zandybot received an unknown command type.";

    res.json({ text: result });
});

// Keep-alive route for browser
app.get('/', (req, res) => res.send("Zandybot is Online!"));

app.listen(PORT, () => console.log(`🚀 Zandybot Live on ${PORT}`));
