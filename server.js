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

// --- AI CORE: THE ARCHITECT ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt + ". RETURN ONLY RAW JSON. NO MARKDOWN.");
    let text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
}

// --- ENDPOINTS ---

// 1. /spawn, /collection, /claim (Kept from previous version)
app.post('/spawn', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    try {
        const data = await askGemini(`Create a monster based on: ${req.body.description}. Format: {"name":"N","element":"E","elLore":"L","atk":50,"def":30,"hp":250,"bio":"B"}`);
        let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
        const monster = { ...data, level: 1, emoji: elementProfiles[data.element.toLowerCase()] || "💎" };
        user.monsters.push(monster);
        user.markModified('monsters');
        await user.save();
        res.json({ text: `${monster.emoji} **${monster.name}** has materialized!\n**Lore:** ${monster.elLore}` });
    } catch (e) { res.json({ text: "⚠️ Spawn failed." }); }
});

app.post('/collection', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    if (!user || user.monsters.length === 0) return res.json({ text: "📭 Empty." });
    let list = `📂 **Digital Bestiary** | 💰 Essence: ${user.essence}\n\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.emoji} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} | ❤️ ${m.hp} HP*\n\n`;
    });
    res.json({ text: list });
});

// 2. /battle (With AI Narration)
app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid selection." });

    const pMon = user.monsters[idx];
    try {
        const battleData = await askGemini(`Narate a fight between Player Monster (${pMon.name}, Element: ${pMon.element}) and a random AI Rival. 
        Decide a winner based on stats (Player Atk: ${pMon.atk}). 
        Format: {"enemyName":"N","narration":"3-sentence epic description of the clash","victory":true/false}`);

        if (battleData.victory) user.essence += 250;
        await user.save();

        res.json({ text: `⚔️ **ARENA: ${pMon.name} vs ${battleData.enemyName}**\n\n${battleData.narration}\n\n${battleData.victory ? "🏆 **VICTORY!** +250 Essence." : "💀 **DEFEAT.**"}` });
    } catch (e) { res.json({ text: "⚠️ Arena glitch." }); }
});

// 3. /evolve (Mutation) - Costs 1000 Essence
app.post('/evolve', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;

    if (!user || !user.monsters[idx] || user.essence < 1000) {
        return res.json({ text: "❌ Needs 1000 Essence or invalid monster." });
    }

    const m = user.monsters[idx];
    try {
        const mutation = await askGemini(`Mutate ${m.name} into a stronger version. 
        Format: {"name":"NewName","atk":${m.atk + 30},"hp":${m.hp + 100},"bio":"New history"}`);
        
        user.monsters[idx] = { ...m, ...mutation, level: m.level + 1 };
        user.essence -= 1000;
        user.markModified('monsters');
        await user.save();

        res.json({ text: `✨ **EVOLUTION!**\n${m.name} has mutated into **${mutation.name}** (Lv.${m.level + 1})!\nStats increased: ⚔️ ${mutation.atk} | ❤️ ${mutation.hp}` });
    } catch (e) { res.json({ text: "⚠️ Evolution failed." }); }
});

// 4. /merge (Fusion) - Combines two monsters
app.post('/merge', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const i1 = parseInt(req.body.idx1) - 1;
    const i2 = parseInt(req.body.idx2) - 1;

    if (!user || !user.monsters[i1] || !user.monsters[i2] || i1 === i2) {
        return res.json({ text: "❌ Select two different monsters." });
    }

    const m1 = user.monsters[i1];
    const m2 = user.monsters[i2];

    try {
        const fusion = await askGemini(`Fuse ${m1.name} and ${m2.name}. 
        Format: {"name":"FusionName","element":"Hybrid","elLore":"Fusion lore","atk":${m1.atk + m2.atk},"hp":${m1.hp + m2.hp},"bio":"Merged bio"}`);

        // Remove old monsters
        user.monsters = user.monsters.filter((_, index) => index !== i1 && index !== i2);
        
        const newMon = { ...fusion, level: 1, emoji: "🧬" };
        user.monsters.push(newMon);
        user.markModified('monsters');
        await user.save();

        res.json({ text: `🧬 **FUSION COMPLETE!**\n${m1.name} + ${m2.name} = **${newMon.name}**\n**Hybrid Stats:** ⚔️ ${newMon.atk} | ❤️ ${newMon.hp}` });
    } catch (e) { res.json({ text: "⚠️ Fusion failed." }); }
});

app.post('/claim', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    const now = new Date();
    if (now - user.lastClaimed < 86400000) return res.json({ text: "⏳ Not yet." });
    user.essence += 500;
    user.lastClaimed = now;
    await user.save();
    res.json({ text: `💰 +500 Essence!` });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
