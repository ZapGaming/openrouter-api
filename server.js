const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());

// --- DATABASE SCHEMA ---
const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    essence: { type: Number, default: 1000 },
    lastClaimed: { type: Date, default: new Date(0) },
    monsters: { type: Array, default: [] } 
});
const User = mongoose.model('User', userSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️"
};

// --- AI CORE ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const strictPrompt = `${prompt}. RETURN ONLY RAW JSON. NO MARKDOWN.
    FORMAT: {"name": "Name", "element": "Type", "elLore": "Lore", "atk": 50, "def": 30, "hp": 250, "bio": "Bio"}`;
    
    const result = await model.generateContent(strictPrompt);
    let text = result.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(text);
    
    return {
        ...data,
        atk: Number(data.atk) || 50,
        def: Number(data.def) || 30,
        hp: Number(data.hp) || 250,
        level: 1,
        emoji: elementProfiles[String(data.element).toLowerCase()] || "💎"
    };
}

// --- ENDPOINTS ---

app.post('/spawn', async (req, res) => {
    // FALLBACK: If BotGhost sends a weird variable, we try to catch it
    const id = req.body.id || req.body.user_id || req.body.userID;
    const { description } = req.body;

    if (!id || id === "undefined") {
        return res.json({ text: "❌ Error: Bot sent an undefined User ID. Check BotGhost variables." });
    }

    try {
        const monster = await askGemini(`Create monster: ${description}`);
        let user = await User.findOne({ discordId: String(id) });
        
        if (!user) {
            user = new User({ discordId: String(id), monsters: [] });
        }

        user.monsters.push(monster);
        user.markModified('monsters'); 
        await user.save();

        console.log(`[SUCCESS] Saved ${monster.name} to ID: ${id}`);

        res.json({
            text: `${monster.emoji} **${monster.name}** has crossed the rift!\n\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk}\n\n*${monster.bio}*`
        });
    } catch (e) {
        res.json({ text: "⚠️ Rift error. Try again." });
    }
});

app.post('/collection', async (req, res) => {
    const id = req.body.id || req.body.user_id || req.body.userID;
    
    try {
        const user = await User.findOne({ discordId: String(id) });

        if (!user || !user.monsters || user.monsters.length === 0) {
            return res.json({ text: `📭 Collection empty for ID: ${id}. Run \`/spawn\` first!` });
        }

        let list = `📂 **Digital Bestiary [Total: ${user.monsters.length}]**\n💰 Essence: ${user.essence}\n\n`;
        user.monsters.forEach((m, i) => {
            list += `**[${i + 1}]** ${m.emoji} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} | ❤️ ${m.hp} HP*\n\n`;
        });

        res.json({ text: list });
    } catch (e) {
        res.json({ text: "⚠️ Database error." });
    }
});

app.post('/claim', async (req, res) => {
    const id = req.body.id || req.body.user_id || req.body.userID;
    try {
        let user = await User.findOne({ discordId: String(id) });
        if (!user) user = new User({ discordId: String(id) });

        const now = new Date();
        const day = 24 * 60 * 60 * 1000;

        if (now - user.lastClaimed < day) {
            return res.json({ text: "⏳ Core recharging. Try again later." });
        }

        user.essence += 500;
        user.lastClaimed = now;
        await user.save();
        res.json({ text: `✨ **Essence Infused!** Total: 💰 **${user.essence}**` });
    } catch (e) { res.json({ text: "⚠️ Claim error." }); }
});

app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id || req.body.userID;
    const { monsterIndex } = req.body;
    
    try {
        const user = await User.findOne({ discordId: String(id) });
        const idx = parseInt(monsterIndex) - 1;

        if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid monster." });

        const pMon = user.monsters[idx];
        const enemy = await askGemini(`Rival for ${pMon.name}`);

        let log = `⚔️ **ARENA: ${pMon.name} vs ${enemy.name}**\n\n`;
        if (pMon.atk >= (enemy.atk * 0.8)) {
            user.essence += 250;
            log += `🏆 **Victory!** +250 Essence.`;
        } else {
            log += `💀 **Defeat.**`;
        }

        user.markModified('essence');
        await user.save();
        res.json({ text: log });
    } catch (e) { res.json({ text: "⚠️ Battle error." }); }
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
