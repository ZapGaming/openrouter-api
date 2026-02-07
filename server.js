const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const activeTokens = new Map();

// --- CONFIG & MIDDLEWARE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- ADVANCED ELEMENT & EMOJI SYSTEM ---
const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "spectre": "👻", "chrono": "⏳", "nebula": "🌌", "titan": "🏔️"
};

const getEmoji = (el) => {
    if (!el) return "💠";
    return elementProfiles[el.toLowerCase()] || "💎"; 
};

// --- DATABASE ARCHITECTURE ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 1000 },
    rank: { type: String, default: "Unranked" },
    history: { wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 } },
    monsters: [{
        name: String,
        element: String,
        elLore: String, // Deep description of the custom element
        emoji: String,
        rarity: String,
        level: { type: Number, default: 1 },
        atk: Number,
        def: Number,
        spd: Number,
        hp: Number,
        maxHp: Number,
        bio: String
    }]
});
const User = mongoose.model('User', userSchema);

// --- AI CORE: MONSTER ARCHITECT ---
async function generateMonsterData(promptStr, isEnemy = false) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Strict prompt to force full stats and lore
    const fullPrompt = `${promptStr}. Return ONLY a JSON object: {
        "name": "Unique Name",
        "element": "Custom Element Type",
        "elLore": "Detailed description of the element's power",
        "rarity": "Legendary/Elite/Common",
        "atk": 50, "def": 30, "spd": 25, "hp": 250,
        "bio": "Deep lore history"
    }`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const cleaned = response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleaned);

    // Finalize stats and assign visual icons
    data.maxHp = data.hp || 200;
    data.emoji = getEmoji(data.element);
    return data;
}

// --- DISCORD PORTAL ROUTES ---

// Endpoint for /dashboard - Secure Token Generation
app.post('/generate-link', (req, res) => {
    const { id } = req.body;
    if (!id) return res.json({ text: "Identification failed. Link aborted." });

    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.set(token, { discordId: id, expires: Date.now() + 7200000 }); // 2-hour window

    res.json({ text: `🌐 **Portal Decrypted.** Access granted for 2h:\nhttps://${req.get('host')}/dash/${token}` });
});

// Endpoint for /spawn - Initial Creation
app.post('/monster', async (req, res) => {
    const { description, rank, id } = req.body;
    try {
        const monster = await generateMonsterData(`Create a powerful creature based on: ${description}. Rank: ${rank}`);
        
        let user = await User.findOne({ discordId: id });
        if (!user) user = new User({ discordId: id });

        user.monsters.push(monster);
        await user.save();

        res.json({ 
            text: `${monster.emoji} **${monster.name}** [${monster.element}]\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk} | 🛡️ ${monster.def}` 
        });
    } catch (err) {
        res.json({ text: "⚠️ The digital rift is unstable. Creation failed." });
    }
});

// --- WEBSITE GAME ROUTES ---

// Main Dashboard: Load World & Monsters
app.get('/dash/:token', async (req, res) => {
    try {
        const session = activeTokens.get(req.params.token);
        if (!session || Date.now() > session.expires) {
            return res.status(403).send("<h1>Session Terminated</h1><p>Generate a new portal in Discord.</p>");
        }

        let user = await User.findOne({ discordId: session.discordId }) || new User({ discordId: session.discordId });
        await user.save(); // Save default if new

        res.render('dashboard', { user, token: req.params.token });
    } catch (err) {
        res.status(500).send("Digital World Crash: " + err.message);
    }
});

// The Arena: Dynamic AI Combat Logic
app.post('/duel-ai', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    if (!session) return res.json({ success: false, msg: "Session expired." });

    const user = await User.findOne({ discordId: session.id });
    const playerMon = user.monsters.id(monsterId);

    try {
        // Generate a random AI Opponent relative to player strength
        const enemy = await generateMonsterData(`Generate an enemy to duel ${playerMon.name} (${playerMon.element}). Level: ${playerMon.level}`, true);

        let battleLog = [];
        let pHP = playerMon.hp;
        let eHP = enemy.hp;

        // Turn-based Battle Simulation
        while (pHP > 0 && eHP > 0) {
            // Player Attack
            const pDmg = Math.max(10, playerMon.atk - (enemy.def * 0.5) + Math.floor(Math.random() * 10));
            eHP -= pDmg;
            battleLog.push(`${playerMon.name} dealt ${pDmg} DMG. Enemy HP: ${Math.max(0, eHP)}`);

            if (eHP <= 0) break;

            // Enemy Attack
            const eDmg = Math.max(10, enemy.atk - (playerMon.def * 0.5) + Math.floor(Math.random() * 10));
            pHP -= eDmg;
            battleLog.push(`${enemy.name} counters with ${eDmg} DMG. Your HP: ${Math.max(0, pHP)}`);
        }

        const victory = pHP > 0;
        if (victory) {
            user.essence += 300;
            user.history.wins += 1;
        } else {
            user.history.losses += 1;
        }

        await user.save();
        res.json({ success: true, victory, log: battleLog, enemy });
    } catch (e) {
        res.json({ success: false, msg: "Combat AI failed to initialize." });
    }
});

// Evolution Engine
app.post('/evolve', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    if (user.essence < 500) return res.json({ success: false, msg: "Insufficient Essence" });

    try {
        const mutation = await generateMonsterData(`Mutate and evolve ${monster.name} (${monster.element}) into a stronger form.`);
        Object.assign(monster, mutation);
        monster.level += 1;
        user.essence -= 500;
        await user.save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

// --- STARTUP ---
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🌌 Zandymon Master Core Online.");
        app.listen(PORT);
    })
    .catch(err => console.error("Database connection failed:", err));
