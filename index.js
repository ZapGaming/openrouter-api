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
        if (data.items?.[0]) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n⭐ Stars: ${repo.stargazers_count}\n📝 ${repo.description || "No description."}`;
        }
        return `❌ Zandybot couldn't find "${query}" on GitHub.`;
    } catch (err) { return "⚠️ GitHub API error."; }
}

// --- MOVIE/SHOW SEARCH (OMDb) ---
async function searchOMDb(query) {
    try {
        const res = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.Response === "True") {
            return `**${data.Type.toUpperCase()}: ${data.Title}** (${data.Year})\n⭐ IMDb: ${data.imdbRating} | 🎭 ${data.Genre}\n📝 ${data.Plot}`;
        }
        return `❌ Zandybot couldn't find the movie "${query}".`;
    } catch (err) { return "⚠️ OMDb API error."; }
}

// --- DEEP SONG SEARCH (Songlink/Odesli) ---
async function searchSong(query) {
    try {
        // We use the search endpoint for broader platform coverage
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        
        if (data.linksByPlatform) {
            const p = data.linksByPlatform;
            let msg = `🎵 **Zandybot found your track on these platforms:**\n`;
            
            // Adding more results as requested
            if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
            if (p.youtubeMusic) msg += `🔴 [YouTube Music](${p.youtubeMusic.url})\n`;
            if (p.appleMusic) msg += `🍎 [Apple Music](${p.appleMusic.url})\n`;
            if (p.youtube) msg += `📺 [YouTube](${p.youtube.url})\n`;
            if (p.deezer) msg += `🟣 [Deezer](${p.deezer.url})\n`;
            if (p.tidal) msg += `⚫ [Tidal](${p.tidal.url})\n`;
            if (p.soundcloud) msg += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
            
            return msg;
        }
        return "❌ Zandybot couldn't find links for that song.";
    } catch (err) { return "⚠️ Music API error."; }
}

// --- MAIN ROUTE ---
app.post('/', async (req, res) => {
    console.log("Incoming Data:", req.body); // Check your Render logs!

    const { type, query } = req.body;
    let finalOutput = "";

    // Added 'search' to match the log you provided
    if (type === 'github' || type === 'search') {
        finalOutput = await searchGithub(query);
    } 
    else if (type === 'watch') {
        finalOutput = await searchOMDb(query);
    } 
    else if (type === 'song') {
        finalOutput = await searchSong(query);
    } 
    else {
        finalOutput = "❌ Zandybot: Unknown command type. Use /repo, /watch, or /song!";
    }

    res.json({ text: finalOutput });
});

// Browser keep-alive
app.get('/', (req, res) => res.send("Zandybot is Online and Awake!"));

app.listen(PORT, () => console.log(`🚀 Zandybot Live on ${PORT}`));
