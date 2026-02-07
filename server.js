const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Temporary session storage for the 2-hour links
const activeTokens = new Map();

// --- CRITICAL APP CONFIG ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE SCHEMA ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 500 },
    rank: { type: String, default: "novice" },
    monsters: [{
        name: String,
        element: String,
        rarity: String,
        level: { type: Number, default: 1 },
        atk: { type: Number, default: 20 },
        hp: { type: Number, default: 120 },
        bio: String
    }]
});
const User = mongoose.model('User', userSchema);

// --- WORLD BOSS DATA ---
let worldBoss = {
    name: "The Monolith of Void",
    hp: 100000,
    maxHp: 100000,
    element: "Entropy"
};

// --- AI ENGINE HELPER ---
async function generateAI(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const cleaned = response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
}

// --- DISCORD PORTAL ROUTES ---

// 1. Generate Link for BotGhost /dashboard
app.post('/generate-link', (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ text: "Error: No Discord ID provided." });

    const token = crypto.randomBytes(16).toString('hex');
    // Save token for 2 hours
    activeTokens.set(token, { discordId: id, expires: Date.now() + 7200000 });
    
    res.json({ text: `🔗 **Portal Open (2h):** https://${req.get('host')}/dash/${token}` });
});

// 2. Spawn Monster for BotGhost /spawn
app.post('/monster', async (req, res) => {
    const { description, rank, id } = req.body;
    try {
        const prompt = `Create a monster RPG profile for: ${description}. User Rank: ${rank}. 
        Return JSON: {"name": "Name", "element": "Type", "rarity": "Common/Rare/Epic", "atk": 25, "hp": 150, "bio": "Lore"}`;
        
        const data = await generateAI(prompt);
        let user = await User.findOne({ discordId: id }) || new User({ discordId: id });
        
        user.monsters.push(data);
        await user.save();

        res.json({ text: `👾 **${data.name}** has materialized!\n🧬 **Element:** ${data.element}\n📝 *${data.bio}*` });
    } catch (err) {
        res.json({ text: "⚠️ The rift collapsed. Try again." });
    }
});

// --- WEBSITE DASHBOARD ROUTES ---

// 3. The Digital World Dashboard (The Website)
app.get('/dash/:token', async (req, res) => {
    try {
        const session = activeTokens.get(req.params.token);
        if (!session || Date.now() > session.expires) {
            return res.status(403).send("<h1>Link Expired</h1><p>Generate a new link in Discord.</p>");
        }

        // FAILSAFE: Ensure user exists so .essence doesn't crash
        let user = await User.findOne({ discordId: session.discordId });
        if (!user) {
            user = new User({ discordId: session.discordId });
            await user.save();
        }

        res.render('dashboard', { user, boss: worldBoss, token: req.params.token });
    } catch (err) {
        res.status(500).send(`Server Error: ${err.message}`);
    }
});

// 4. Evolution Logic (Site)
app.post('/evolve', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    if (!session) return res.json({ success: false, msg: "Session expired" });

    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    if (user.essence < 300) return res.json({ success: false, msg: "Not enough Essence (Need 300)" });

    try {
        const prompt = `Evolve ${monster.name} (${monster.element}). Level it up. Return JSON: {"name": "New Name", "bio": "New Bio", "atk": ${monster.atk + 20}, "hp": ${monster.hp + 50}}`;
        const data = await generateAI(prompt);
        
        Object.assign(monster, data);
        monster.level += 1;
        user.essence -= 300;
        await user.save();
        
        res.json({ success: true });
    } catch (e) { res.json({ success: false, msg: "AI Evolution Failed" }); }
});

// 5. Merging Logic (Site)
app.post('/merge', async (req, res) => {
    const { token, m1Id, m2Id } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });

    if (user.monsters.length < 2) return res.json({ success: false, msg: "Need 2 monsters" });

    const m1 = user.monsters.id(m1Id);
    const m2 = user.monsters.id(m2Id);

    const prompt = `Combine ${m1.name} and ${m2.name}. Mix their descriptions. Return JSON: {"name": "Hybrid Name", "element": "Combined", "atk": ${m1.atk + m2.atk}, "hp": ${m1.hp + m2.hp}, "bio": "New Bio"}`;
    const data = await generateAI(prompt);

    user.monsters.pull(m1Id);
    user.monsters.pull(m2Id);
    user.monsters.push(data);
    await user.save();

    res.json({ success: true });
});

// 6. World Boss Logic (Site)
app.post('/attack-boss', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    const damage = monster.atk + Math.floor(Math.random() * 10);
    worldBoss.hp -= damage;
    user.essence += 10; // Bounty for attacking
    
    await user.save();
    res.json({ success: true, damage, bossHp: worldBoss.hp });
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🌌 MongoDB Linked. Digital World Online.");
        app.listen(PORT);
    })
    .catch(err => console.error("Database Connection Failed:", err));
