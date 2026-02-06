const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// 1. AI Logic (Same as before)
async function getAIResponse(prompt, user) {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [{ role: "system", content: "You are the Chillax Support AI." }, { role: "user", content: prompt }]
            })
        });
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "🌊";
    } catch (err) { return "⚠️ AI Error."; }
}

// 2. GitHub Search Logic
async function searchGithub(query) {
    try {
        const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const repo = data.items[0];
            return `📂 **Repo Found:** [${repo.full_name}](${repo.html_url})\n⭐ **Stars:** ${repo.stargazers_count}\n📝 **Description:** ${repo.description || "No description provided."}`;
        }
        return "❌ No repositories found for that search.";
    } catch (err) { return "⚠️ GitHub API Error."; }
}

// 3. Foolproof Route
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Online.");

    const { type, prompt, user, query } = req.body;

    // Handle GitHub Search
    if (type === 'search') {
        const result = await searchGithub(query);
        return res.json({ reply: result });
    }

    // Default to AI Help
    const answer = await getAIResponse(prompt, user || "User");
    res.json({ reply: answer });
});

app.listen(PORT, () => console.log(`🚀 Chillax Multi-Tool Live on ${PORT}`));
