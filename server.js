const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());

// --- DATABASE ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 1000 },
    lastClaimed: { type: Date, default: new Date(0) },
    monsters: [{
        name: String,
        element: String,
        elLore: String, 
        emoji: String,
        atk: { type: Number, default: 40 },
        def: { type: Number, default: 20 },
        spd: { type: Number, default: 15 },
        hp: { type: Number, default: 200 },
        maxHp: { type: Number, default: 200 },
        bio: String,
        level: { type: Number, default: 1 }
    }]
});
const User = mongoose.model('User', userSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️"
};

// --- FIX: Strict AI Prompting ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const strictPrompt = `${prompt}. 
    CRITICAL: Return ONLY JSON. 
    Required fields: "name", "element", "elLore", "atk" (number), "def" (number), "spd" (number), "hp" (number), "bio". 
    Do not include any text outside the JSON brackets.`;
    
    const result = await model.generateContent(strictPrompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(text);
    
    // Failsafe: Ensure no field is undefined
    return {
        name: data.name || "Unknown Entity",
        element: data.element || "Unknown",
        elLore: data.elLore || "A mysterious force from the digital rift.",
        atk: Number(data.atk) || 40,
        def: Number(data.def) || 20,
        spd: Number(data.spd) || 15,
        hp: Number(data.hp) || 200,
        bio: data.bio || "No data available."
    };
}

// --- ENDPOINTS ---

app.post('/spawn', async (req, res) => {
    const { id, description } = req.body;
    try {
        const data = await askGemini(`Generate a detailed monster for: ${description}`);
        
        let user = await User.findOne({ discordId: String(id) });
        if (!user) user = new User({ discordId: String(id) });

        const emoji = elementProfiles[data.element.toLowerCase()] || "💎";
        const monster = { ...data, emoji, maxHp: data.hp };

        user.monsters.push(monster);
        await user.save();

        res.json({
            text: `${monster.emoji} **${monster.name}** has crossed the rift!\n\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk} | 🛡️ ${monster.def} | ⚡ ${monster.spd}\n\n*${monster.bio}*`
        });
    } catch (e) { 
        console.error(e);
        res.json({ text: "⚠️ Rift error. Gemini output was messy. Try again." }); 
    }
});

app.post('/collection', async (req, res) => {
    const { id } = req.body;
    // Force ID to string to ensure matching
    const user = await User.findOne({ discordId: String(id) });

    if (!user || !user.monsters || user.monsters.length === 0) {
        return res.json({ text: "📭 Your collection is empty. Did you `/spawn` one yet?" });
    }

    let list = `📂 **Digital Bestiary [Total: ${user.monsters.length}]**\n💰 Essence: ${user.essence}\n\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.emoji} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} | 🛡️ ${m.def} | ❤️ ${m.hp} HP*\n\n`;
    });

    res.json({ text: list });
});

app.post('/claim', async (req, res) => {
    const { id } = req.body;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });

    const now = new Date();
    const hours24 = 24 * 60 * 60 * 1000;
    if (now - user.lastClaimed < hours24) {
        return res.json({ text: "⏳ You have already drawn essence today. Return in 24 hours." });
    }

    user.essence += 500;
    user.lastClaimed = now;
    await user.save();
    res.json({ text: `✨ **Essence Infused!**\n+500 Essence added. Total: 💰 **${user.essence}**` });
});

app.post('/battle', async (req, res) => {
    const { id, monsterIndex } = req.body;
    const user = await User.findOne({ discordId: String(id) });
    
    // User types 1, but we need 0 (array index)
    const idx = parseInt(monsterIndex) - 1;

    if (!user || !user.monsters[idx]) {
        return res.json({ text: "❌ Invalid selection. Check your `/collection` for the correct number." });
    }

    const pMon = user.monsters[idx];
    try {
        const enemy = await askGemini(`Generate a rival for ${pMon.name}.`);
        let pHP = pMon.hp;
        let eHP = enemy.hp;
        let log = `⚔️ **BATTLE: ${pMon.name.toUpperCase()} VS ${enemy.name.toUpperCase()}**\n\n`;

        // Duel Logic
        const pDmg = Math.max(15, pMon.atk - (enemy.def * 0.3));
        const eDmg = Math.max(15, enemy.atk - (pMon.def * 0.3));
        
        // Simulating turns for the text log
        log += `> ${pMon.name} strikes for ${Math.floor(pDmg)}!\n`;
        log += `> ${enemy.name} counters for ${Math.floor(eDmg)}!\n\n`;

        if (pDmg >= eDmg) {
            user.essence += 250;
            log += `🏆 **WINNER: ${pMon.name}**\nEarned +250 Essence!`;
        } else {
            log += `💀 **DEFEAT: ${pMon.name} was overwhelmed.**`;
        }

        await user.save();
        res.json({ text: log });
    } catch (e) { res.json({ text: "⚠️ Battle engine stalled." }); }
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
