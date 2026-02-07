const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());

// --- DATABASE ARCHITECTURE ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 1000 },
    lastClaimed: { type: Date, default: new Date(0) }, // For the /claim logic
    monsters: [{
        name: String,
        element: String,
        elLore: String, 
        emoji: String,
        atk: Number,
        def: Number,
        spd: Number,
        hp: Number,
        level: { type: Number, default: 1 },
        bio: String
    }]
});
const User = mongoose.model('User', userSchema);

// --- EMOJI ENGINE ---
const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "spectre": "👻", "chrono": "⏳", "nebula": "🌌", "titan": "🏔️", "vortex": "🌪️"
};
const getEmoji = (el) => elementProfiles[el.toLowerCase()] || "💎";

// --- AI CORE HELPER ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt + ". Return ONLY raw JSON.");
    const text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
}

// --- DISCORD COMMAND ENDPOINTS ---

// 1. /spawn 
app.post('/spawn', async (req, res) => {
    const { id, description } = req.body;
    try {
        const prompt = `Generate a monster: ${description}. Include: name, element, elLore (element origin), atk, def, spd, hp, bio.`;
        const data = await askGemini(prompt);
        
        let user = await User.findOne({ discordId: id }) || new User({ discordId: id });
        
        const monster = {
            ...data,
            emoji: getEmoji(data.element),
            hp: data.hp || 200,
            atk: data.atk || 40
        };

        user.monsters.push(monster);
        await user.save();

        res.json({
            text: `${monster.emoji} **${monster.name}** has crossed the rift!\n\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk} | 🛡️ ${monster.def}\n\n*${monster.bio}*`
        });
    } catch (e) { res.json({ text: "⚠️ Rift instability. Try spawning again." }); }
});

// 2. /monster_collection
app.post('/collection', async (req, res) => {
    const { id } = req.body;
    const user = await User.findOne({ discordId: id });

    if (!user || user.monsters.length === 0) {
        return res.json({ text: "📭 Your collection is empty. Use `/spawn` to begin." });
    }

    let list = `📂 **${id}'s Digital Bestiary**\n💰 Essence: ${user.essence}\n\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.emoji} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} ATK | ❤️ ${m.hp} HP*\n\n`;
    });

    res.json({ text: list });
});

// 3. /battle (AI Duel)
app.post('/battle', async (req, res) => {
    const { id, monsterIndex } = req.body; // BotGhost should pass index (e.g., 0 for first monster)
    const user = await User.findOne({ discordId: id });
    
    if (!user || !user.monsters[monsterIndex]) {
        return res.json({ text: "❌ Invalid monster selection." });
    }

    const pMon = user.monsters[monsterIndex];

    try {
        const enemy = await askGemini(`Generate a rival monster to fight ${pMon.name}. Strength level ${pMon.level}.`);
        
        let log = `⚔️ **BATTLE INITIATED** ⚔️\n**${pMon.name}** vs **${enemy.name}** (${enemy.element})\n\n`;
        let pHP = pMon.hp;
        let eHP = enemy.hp;

        // Fast Combat Logic
        while (pHP > 0 && eHP > 0) {
            const pDmg = Math.max(10, pMon.atk - (enemy.def * 0.5) + 5);
            eHP -= pDmg;
            if (eHP <= 0) break;
            const eDmg = Math.max(10, enemy.atk - (pMon.def * 0.5) + 5);
            pHP -= eDmg;
        }

        const victory = pHP > 0;
        if (victory) {
            user.essence += 200;
            log += `✅ **Victory!** ${pMon.name} dominated the arena.\n💰 +200 Essence rewarded.`;
        } else {
            log += `💀 **Defeat.** ${enemy.name} was too powerful.`;
        }

        await user.save();
        res.json({ text: log });
    } catch (e) { res.json({ text: "⚠️ Combat AI offline." }); }
});

// 4. /claim (Daily Essence)
app.post('/claim', async (req, res) => {
    const { id } = req.body;
    let user = await User.findOne({ discordId: id }) || new User({ discordId: id });

    const now = new Date();
    const diff = now - user.lastClaimed;
    const hours24 = 24 * 60 * 60 * 1000;

    if (diff < hours24) {
        const timeLeft = Math.ceil((hours24 - diff) / (60 * 60 * 1000));
        return res.json({ text: `⏳ Patience, Wanderer. You can claim again in **${timeLeft} hours**.` });
    }

    user.essence += 500;
    user.lastClaimed = now;
    await user.save();

    res.json({ text: `✨ **Essence Infused!**\n+500 Essence added to your core.\nTotal: 💰 **${user.essence}**` });
});

// STARTUP
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log("🌌 Discord Game Engine Active.");
    app.listen(PORT);
});
