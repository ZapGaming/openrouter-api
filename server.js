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
    monsters: { type: Array, default: [] } // Simple array to prevent schema casting errors
});
const User = mongoose.model('User', userSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️"
};

// --- CORE AI & FORMATTER ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const strictPrompt = `${prompt}. 
    RETURN ONLY RAW JSON. NO MARKDOWN. NO CODE BLOCKS.
    FORMAT: {"name": "Name", "element": "Type", "elLore": "Lore", "atk": 40, "def": 20, "spd": 15, "hp": 200, "bio": "Bio"}`;
    
    const result = await model.generateContent(strictPrompt);
    let text = result.response.text().trim();
    
    // Clean any accidental markdown code blocks
    text = text.replace(/```json|```/g, "").trim();
    
    const data = JSON.parse(text);
    
    // Force Formatting & Default Values
    return {
        name: data.name || "Unknown Entity",
        element: data.element || "Aura",
        elLore: data.elLore || "Mysterious digital energy.",
        atk: Number(data.atk) || 45,
        def: Number(data.def) || 25,
        spd: Number(data.spd) || 20,
        hp: Number(data.hp) || 250,
        maxHp: Number(data.hp) || 250,
        bio: data.bio || "Origin unknown.",
        level: 1,
        emoji: elementProfiles[String(data.element).toLowerCase()] || "💎"
    };
}

// --- ENDPOINTS ---

app.post('/spawn', async (req, res) => {
    const { id, description } = req.body;
    console.log(`[SPAWN] Request for User: ${id}`);

    try {
        const monster = await askGemini(`Create monster: ${description}`);
        
        // FIND OR CREATE USER
        let user = await User.findOne({ discordId: String(id) });
        if (!user) {
            console.log(`[DB] Creating new user record for ${id}`);
            user = new User({ discordId: String(id), monsters: [] });
        }

        // FORCE PUSH AND SAVE
        user.monsters.push(monster);
        user.markModified('monsters'); // CRITICAL: Tells Mongoose the array changed
        
        await user.save();
        console.log(`[DB] Monster "${monster.name}" saved to User ${id}. Total now: ${user.monsters.length}`);

        res.json({
            text: `${monster.emoji} **${monster.name}** has crossed the rift!\n\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk} | 🛡️ ${monster.def} | ⚡ ${monster.spd}\n\n*${monster.bio}*`
        });
    } catch (e) { 
        console.error(`[ERROR] Spawn failed:`, e.message);
        res.json({ text: "⚠️ The digital rift collapsed. Please try again." }); 
    }
});

app.post('/collection', async (req, res) => {
    const { id } = req.body;
    console.log(`[COLLECTION] Fetching for User: ${id}`);

    try {
        const user = await User.findOne({ discordId: String(id) });

        if (!user || !user.monsters || user.monsters.length === 0) {
            return res.json({ text: "📭 Your collection is empty. Run `/spawn` to begin your journey." });
        }

        let list = `📂 **Digital Bestiary [Total: ${user.monsters.length}]**\n💰 Essence: ${user.essence}\n\n`;
        user.monsters.forEach((m, i) => {
            list += `**[${i + 1}]** ${m.emoji || '💎'} **${m.name}** (Lv.${m.level || 1})\n   *${m.element} | ⚔️ ${m.atk} | 🛡️ ${m.def} | ❤️ ${m.hp} HP*\n\n`;
        });

        res.json({ text: list });
    } catch (e) {
        console.error(`[ERROR] Collection fetch failed:`, e.message);
        res.json({ text: "⚠️ Error accessing the bestiary." });
    }
});

app.post('/claim', async (req, res) => {
    const { id } = req.body;
    try {
        let user = await User.findOne({ discordId: String(id) });
        if (!user) user = new User({ discordId: String(id) });

        const now = new Date();
        const hours24 = 24 * 60 * 60 * 1000;
        
        if (now - user.lastClaimed < hours24) {
            const remaining = Math.ceil((hours24 - (now - user.lastClaimed)) / (60 * 60 * 1000));
            return res.json({ text: `⏳ Your core is still recharging. Return in **${remaining} hours**.` });
        }

        user.essence += 500;
        user.lastClaimed = now;
        await user.save();
        res.json({ text: `✨ **Essence Infused!**\n+500 Essence added. Total: 💰 **${user.essence}**` });
    } catch (e) {
        res.json({ text: "⚠️ Claim failed." });
    }
});

// BATTLE LOGIC
app.post('/battle', async (req, res) => {
    const { id, monsterIndex } = req.body;
    try {
        const user = await User.findOne({ discordId: String(id) });
        const idx = parseInt(monsterIndex) - 1;

        if (!user || !user.monsters[idx]) {
            return res.json({ text: "❌ Invalid selection. Use `/collection` to see your monsters." });
        }

        const pMon = user.monsters[idx];
        const enemy = await askGemini(`Enemy for ${pMon.name}`);
        
        let log = `⚔️ **ARENA DUEL: ${pMon.name.toUpperCase()} VS ${enemy.name.toUpperCase()}**\n\n`;
        
        const pDmg = Math.max(20, pMon.atk - (enemy.def * 0.2));
        const eDmg = Math.max(20, enemy.atk - (pMon.def * 0.2));

        if (pDmg >= eDmg) {
            user.essence += 250;
            log += `> ${pMon.name} dominated with ${Math.floor(pDmg)} damage!\n🏆 **Victory!** +250 Essence.`;
        } else {
            log += `> ${enemy.name} was too fast!\n💀 **Defeat.** Your monster retreated.`;
        }

        await user.save();
        res.json({ text: log });
    } catch (e) {
        res.json({ text: "⚠️ Arena is currently closed." });
    }
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🌌 DATABASE CONNECTED");
        app.listen(PORT, () => console.log(`🚀 ENGINE LIVE ON PORT ${PORT}`));
    });
