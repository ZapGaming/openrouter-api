const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// AI Logic
async function getAIResponse(prompt, user) {
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct:free",
                messages: [
                    { role: "system", content: "You are the Chillax Support AI. Be chill and helpful." },
                    { role: "user", content: `User ${user} asks: ${prompt}` }
                ]
            })
        });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "🌊 Thinking...";
    } catch (err) { return "⚠️ AI Error."; }
}

// GitHub Search Logic
async function searchGithub(query) {
    try {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=1`);
        const data = await res.json();
        if (data.items && data.items.length > 0) {
            const repo = data.items[0];
            return `📂 **Repo:** [${repo.full_name}](${repo.html_url})\n⭐ **Stars:** ${repo.stargazers_count}\n📝 ${repo.description || "No description."}`;
        }
        return "❌ No repo found.";
    } catch (err) { return "⚠️ GitHub API Error."; }
}

// Catch-All Route
app.all('*', async (req, res) => {
    if (req.method !== 'POST') return res.status(200).send("Server is up!");

    const { type, prompt, user, query } = req.body;

    if (type === 'search') {
        const result = await searchGithub(query);
        return res.json({ response: result }); // Changed to .response
    }

    const answer = await getAIResponse(prompt, user || "User");
    res.json({ response: answer }); // Changed to .response
});

app.listen(PORT, () => console.log(`🚀 Chillax Server Ready on port ${PORT}`));
