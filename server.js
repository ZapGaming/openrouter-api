const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Memory storage for 2-hour secure dashboard tokens
const activeTokens = new Map();

// --- CONFIGURATION ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- EMOJI & ELEMENT LOGIC ---
const elementEmojis = {
    "fire": "🔥", "water": "💧", "earth": "🌿", "lightning": "⚡",
    "magic": "🔮", "soul": "👻", "legend": "👑", "void": "🌑",
    "ice": "❄️", "light": "✨", "dark": "🕶️", "metal": "⚙️", "nature": "🍃"
};

const getEmoji = (el) => {
    if (!el) return "🌀";
    const found = elementEmojis[el.toLowerCase()];
    return found || "🌀"; // 🌀 is the fallback for unique/custom AI elements
};

// --- DATABASE SCHEMA ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 500 },
    rank: { type: String, default: "novice" },
    monsters: [{
        name: String,
        element: String,
        emoji: String,
        rarity: String,
        level: { type: Number, default: 1 },
        atk: { type: Number, default: 10 },
        hp: { type: Number, default: 100 },
        bio: String
    }]
});
const User = mongoose.model('User', userSchema);

// --- WORLD BOSS STATE ---
let worldBoss = {
    name: "The Monolith of Void",
    hp: 100000,
    maxHp: 100000,
    element: "Entropy"
};

// --- AI ENGINE (STRICT STAT ENFORCEMENT) ---
async function generateAI(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const cleaned = response.text().replace(/```json|```/g, "").trim();
    
    let data = JSON.parse(cleaned);
    
    // Safety check: Force stats if AI forgets them
    if (!data.atk || isNaN(data.atk)) data.atk = Math.floor(Math.random() * 20) + 15;
    if (!data.hp || isNaN(data.hp)) data.hp = Math.floor(Math.random() * 50) + 100;
    
    return data;
}

// --- ROUTES: DISCORD PORTAL ---

// 1. Generate Link for BotGhost /dashboard
app.post('/generate-link', (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ text: "Error: No User ID provided." });

    const token = crypto.randomBytes(16).toString('hex');
    activeTokens.set(token, { discordId: id, expires: Date.now() + 7200000 });
    
    res.json({ text: `🔗 **Portal Open (2h):** https://${req.get('host')}/dash/${token}` });
});

// 2. Spawn Monster for BotGhost /spawn
app.post('/monster', async (req, res) => {
    const { description, rank, id } = req.body;
    try {
        const prompt = `Create a monster RPG profile. Description: ${description}. Rank: ${rank}. 
        Return JSON ONLY: {"name": "Name", "element": "Type", "rarity": "Common/Rare", "atk": 25, "hp": 150, "bio": "Lore"}`;
        
        const data = await generateAI(prompt);
        let user = await User.findOne({ discordId: id }) || new User({ discordId: id });
        
        const finalMonster = {
            ...data,
            emoji: getEmoji(data.element)
        };
        
        user.monsters.push(finalMonster);
        await user.save();

        res.json({ text: `${finalMonster.emoji} **${data.name}** materialized with **${data.hp} HP**!` });
    } catch (err) {
        console.error(err);
        res.json({ text: "⚠️ Rift error. AI failed to spawn creature." });
    }
});

// --- ROUTES: WEBSITE DASHBOARD ---

// 3. Main Site View
app.get('/dash/:token', async (req, res) => {
    try {
        const session = activeTokens.get(req.params.token);
        if (!session || Date.now() > session.expires) {
            return res.status(403).send("<h1>Session Expired</h1><p>Generate a new link in Discord.</p>");
        }

        let user = await User.findOne({ discordId: session.discordId });
        if (!user) {
            user = new User({ discordId: session.discordId });
            await user.save();
        }

        res.render('dashboard', { user, boss: worldBoss, token: req.params.token });
    } catch (err) {
        res.status(500).send("Digital World Error: " + err.message);
    }
});

// 4. Attack Boss Logic
app.post('/attack-boss', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    if (!session) return res.json({ success: false });

    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);
    
    const damage = monster.atk + Math.floor(Math.random() * 10);
    worldBoss.hp -= damage;
    user.essence += 10; 
    
    await user.save();
    res.json({ success: true, damage, bossHp: worldBoss.hp });
});

// 5. Evolution Logic
app.post('/evolve', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    if (user.essence < 300) return res.json({ success: false, msg: "Need 300 Essence" });

    try {
        const prompt = `Evolve ${monster.name}. New level: ${monster.level + 1}. 
        Return JSON: {"name": "NewName", "bio": "NewBio", "atk": ${monster.atk + 20}, "hp": ${monster.hp + 50}, "element": "${monster.element}"}`;
        
        const data = await generateAI(prompt);
        Object.assign(monster, data);
        monster.level += 1;
        user.essence -= 300;
        
        await user.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// 6. Merging Logic
app.post('/merge', async (req, res) => {
    const { token, id1, id2 } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });

    const m1 = user.monsters.id(id1);
    const m2 = user.monsters.id(id2);

    const prompt = `Merge ${m1.name} and ${m2.name}. Return JSON: {"name": "HybridName", "element": "Hybrid", "atk": ${m1.atk + m2.atk}, "hp": ${m1.hp + m2.hp}, "bio": "Combined Lore"}`;
    const data = await generateAI(prompt);

    user.monsters.pull(id1);
    user.monsters.pull(id2);
    user.monsters.push({...data, emoji: "🧬"});
    await user.save();

    res.json({ success: true });
});

// --- STARTUP ---
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🌌 Digital World Engine Live.");
        app.listen(PORT);
    })
    .catch(err => console.error("Database connection error:", err));
