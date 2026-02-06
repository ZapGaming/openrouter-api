const express = require('express');
const { createCanvas } = require('canvas');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OMDB_API_KEY = process.env.OMDB_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- IMAGE GENERATOR (FUTURE COMMITS) ---
async function generateCommitCard(commit, repoName) {
    const canvas = createCanvas(800, 250);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#11111b';
    ctx.fillRect(0, 0, 800, 250);

    // Neon Gradient Border
    const grad = ctx.createLinearGradient(0, 0, 800, 0);
    grad.addColorStop(0, '#89b4fa'); 
    grad.addColorStop(1, '#f5c2e7'); 
    ctx.strokeStyle = grad;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 780, 230);

    // Text
    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`📦 PUSH: ${repoName.toUpperCase()}`, 40, 60);

    ctx.fillStyle = '#fab387'; 
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

// --- LOGIC: FETCH LAST 10 COMMITS (PAST) ---
async function getCommitHistory(repoPath) {
    try {
        const res = await fetch(`https://api.github.com/repos/${repoPath}/commits?per_page=10`);
        const data = await res.json();
        
        if (Array.isArray(data)) {
            let msg = `📜 **Zandybot History: Last 10 Commits for ${repoPath}**\n\n`;
            data.forEach((c, i) => {
                const shortSha = c.sha.substring(0, 7);
                const cleanMsg = c.commit.message.split('\n')[0];
                msg += `**${i + 1}.** \`${shortSha}\` - ${cleanMsg} (*${c.commit.author.name}*)\n`;
            });
            return msg;
        }
        return "❌ Repo not found. Format must be `owner/repo` (e.g., `facebook/react`).";
    } catch (e) { return "⚠️ GitHub History API Error."; }
}

// --- LOGIC: DEEP SONG SEARCH ---
async function searchSong(query) {
    try {
        const res = await fetch(`https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(query)}&userCountry=US`);
        const data = await res.json();
        if (!data.linksByPlatform) return "❌ No song links found.";
        
        const p = data.linksByPlatform;
        let msg = `🎵 **Zandybot Multi-Link Results:**\n`;
        if (p.spotify) msg += `🟢 [Spotify](${p.spotify.url})\n`;
        if (p.youtubeMusic) msg += `🔴 [YT Music](${p.youtubeMusic.url})\n`;
        if (p.appleMusic) msg += `🍎 [Apple Music](${p.appleMusic.url})\n`;
        if (p.youtube) msg += `📺 [YouTube](${p.youtube.url})\n`;
        if (p.tidal) msg += `⚫ [Tidal](${p.tidal.url})\n`;
        if (p.deezer) msg += `🟣 [Deezer](${p.deezer.url})\n`;
        if (p.soundcloud) msg += `☁️ [SoundCloud](${p.soundcloud.url})\n`;
        return msg;
    } catch (e) { return "⚠️ Music API error."; }
}

// --- WEBHOOK: FUTURE COMMITS ---
app.post('/github-webhook', async (req, res) => {
    const push = req.body;
    if (push.commits && push.commits.length > 0) {
        const commit = push.commits[0];
        const image = await generateCommitCard(commit, push.repository.name);

        const formData = new FormData();
        formData.append('file', new Blob([image]), 'commit.png');
        formData.append('payload_json', JSON.stringify({
            embeds: [{
                title: "⚡ Future Code Detected",
                url: commit.url,
                color: 0x89b4fa,
                image: { url: 'attachment://commit.png' }
            }]
        }));
        await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: formData });
    }
    res.sendStatus(200);
});

// --- MAIN BOT INTERFACE (BOTGHOST) ---
app.post('/', async (req, res) => {
    const { type, query } = req.body;
    let out = "";

    if (type === 'history') out = await getCommitHistory(query);
    else if (type === 'song') out = await searchSong(query);
    else if (type === 'search' || type === 'github') {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items?.[0]) {
            const r = data.items[0];
            out = `📂 **Repo:** [${r.full_name}](${r.html_url})\n⭐ Stars: ${r.stargazers_count}\n📝 ${r.description}`;
        } else out = "❌ Repo not found.";
    } 
    else if (type === 'watch') {
        const res = await fetch(`http://www.omdbapi.com/?apikey=${OMDB_API_KEY}&t=${encodeURIComponent(query)}`);
        const m = await res.json();
        out = m.Response === "True" ? `🎬 **${m.Title}** (${m.Year})\n⭐ IMDb: ${m.imdbRating}\n📝 ${m.Plot}` : "❌ Movie not found.";
    }

    res.json({ text: out });
});

app.get('/', (req, res) => res.send("Zandybot 2.0: Active"));
app.listen(PORT, () => console.log(`🚀 Zandybot listening on ${PORT}`));
