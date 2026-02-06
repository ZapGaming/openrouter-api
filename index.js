const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;

// --- GITHUB REPO SEARCH ---
async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        
        if (data.items && data.items.length > 0) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n` +
                   `⭐ Stars: ${repo.stargazers_count} | 🍴 Forks: ${repo.forks_count}\n` +
                   `📝 ${repo.description || "No description provided."}`;
        }
        return `❌ Zandybot couldn't find a repo for "${query}".`;
    } catch (err) {
        return "⚠️ GitHub API is acting up.";
    }
}

// --- MOVIE/SHOW SEARCH (OMDb) ---
async function searchOMDb(query) {
    try {
        const url = `http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.Response === "True") {
            return `**${data.Type.toUpperCase()}: ${data.Title}** (${data.Year})\n` +
                   `⭐ IMDb: ${data.imdbRating} | 🎭 ${data.Genre}\n` +
                   `📝 ${data.Plot}`;
        }
        return `❌ Zandybot couldn't find that movie/show.`;
    } catch (err) {
        return "⚠️ OMDb API error.";
    }
}

// --- SONG SEARCH (Songlink) ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let msg = `🎵 **Links for: ${query}**\n`;
            if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.youtube) msg += `📺 [YouTube](${p.youtube.url})\n`;
            if (p.appleMusic) msg += `🍎 [Apple Music](${p.appleMusic.url})\n`;
            return msg;
        }
        return "❌ Zandybot couldn't find those song links.";
    } catch (err) { return "⚠️ Music API error."; }
}

// --- MAIN ROUTE ---
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Zandybot is Online!");

    const { type, query } = req.body;
    let finalOutput = "";

    // Routing based on command type
    if (type === 'github') finalOutput = await searchGithub(query);
    else if (type === 'watch') finalOutput = await searchOMDb(query);
    else if (type === 'song') finalOutput = await searchSong(query);
    else finalOutput = "Zandybot: Online. Use /repo, /watch, or /song!";

    res.json({ text: finalOutput });
});

app.listen(PORT, () => console.log(`🚀 Zandybot Live on Port ${PORT}`));
