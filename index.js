const express = require('express');
const { createCanvas } = require('canvas');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- IMAGE GENERATOR (THE FORGE) ---
async function generateCommitCard(commit, repoName) {
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // Background Styling
    ctx.fillStyle = '#11111b'; // Deep Space
    ctx.fillRect(0, 0, 800, 250);

    // Neon Border
    const grad = ctx.createLinearGradient(0, 0, 800, 0);
    grad.addColorStop(0, '#89b4fa'); // Blue
    grad.addColorStop(1, '#f5c2e7'); // Pink
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 780, 230);

    // Text Content
    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`📦 REPO: ${repoName.toUpperCase()}`, 40, 60);

    ctx.fillStyle = '#fab387'; // Orange accent
    ctx.font = '22px monospace';
    ctx.fillText(`HASH: ${commit.id.substring(0, 7)}`, 40, 100);

    ctx.fillStyle = '#a6adc8';
    ctx.font = '20px sans-serif';
    ctx.fillText(`"${commit.message}"`, 40, 150);
    
    ctx.fillStyle = '#94e2d5';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`-- ${commit.author.name}`, 40, 200);

    return canvas.toBuffer('image/png');
}

// --- LOGIC: SONG SEARCH (DEEP RESULTS) ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        if (!data.linksByPlatform) return "❌ No song found.";
        
        const p = data.linksByPlatform;
        let msg = `🎵 **Zandybot Multi-Link for: ${query}**\n`;
        if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
        if (p.youtubeMusic) msg += `🔴 [YT Music](${p.youtubeMusic.url})\n`;
        if (p.appleMusic) msg += `🍎 [Apple Music](${p.appleMusic.url})\n`;
        if (p.tidal) msg += `⚫ [Tidal](${p.tidal.url})\n`;
        if (p.soundcloud) msg += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
        return msg;
    } catch (e) { return "⚠️ Music API error."; }
}

// --- LOGIC: GITHUB REPO ---
async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items?.[0]) {
            const r = data.items[0];
            return `📂 **Repo:** [${r.full_name}](${r.html_url})\n⭐ Stars: ${r.stargazers_count}\n📝 ${r.description}`;
        }
        return "❌ Repo not found.";
    } catch (e) { return "⚠️ GitHub error."; }
}

// --- WEBHOOK: GITHUB PUSH EVENT ---
app.post('/github-webhook', async (req, res) => {
    const push = req.body;
    if (push.commits && push.commits.length > 0) {
        const commit = push.commits[0];
        const image = await generateCommitCard(commit, push.repository.name);

        // Send to Discord Webhook
        const formData = new FormData();
        formData.append('file', new Blob([image]), 'commit.png');
        formData.append('payload_json', JSON.stringify({
            embeds: [{
                title: "New Code Pushed to GitHub",
                color: 0x89b4fa,
                image: { url: 'attachment://commit.png' }
            }]
        }));
        await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
    }
    res.sendStatus(200);
});

// --- MAIN BOT INTERFACE ---
app.post('/', async (req, res) => {
    const { type, query } = req.body;
    let out = "";
    if (type === 'song') out = await searchSong(query);
    else if (type === 'search' || type === 'github') out = await searchGithub(query);
    else if (type === 'watch') {
        const movieRes = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(query)}`);
        const m = await movieRes.json();
        out = m.Response === "True" ? `🎬 **${m.Title}** (${m.Year})\n⭐ IMDb: ${m.imdbRating}\n📝 ${m.Plot}` : "❌ Not found.";
    }
    res.json({ text: out });
});

app.get('/', (req, res) => res.send("Zandybot 2.0: Online"));
app.listen(PORT);
