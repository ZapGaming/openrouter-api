const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());

// --- DATABASE SCHEMAS ---
const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    essence: { type: Number, default: 1000 },
    lastClaimed: { type: Date, default: new Date(0) },
    monsters: { type: Array, default: [] },
    guildId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', default: null }
});

const guildSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    ownerId: String,
    members: [String],
    level: { type: Number, default: 1 },
    vault: { type: Number, default: 0 },
    joinRequirement: { type: Number, default: 0 },
    specialElement: { type: String, default: "Void" } 
});

const User = mongoose.model('User', userSchema);
const Guild = mongoose.model('Guild', guildSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️"
};

// --- AI CORE ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt + ". RETURN RAW JSON ONLY. NO MARKDOWN.");
    let text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
}

// --- GUILD SYSTEM ---

app.post('/guild_create', async (req, res) => {
    const { id, name, reqEssence } = req.body;
    let user = await User.findOne({ discordId: String(id) });
    if (!user) user = new User({ discordId: String(id) });
    
    if (user.guildId) return res.json({ text: "❌ You are already in a guild!" });
    if (user.essence < 5000) return res.json({ text: "❌ You need 5,000 Essence to found a Guild." });

    try {
        const specialElements = ["Nebula", "Titan", "Chrono", "Spectre", "Solaris"];
        const randEl = specialElements[Math.floor(Math.random() * specialElements.length)];
        
        const newGuild = new Guild({
            name: name,
            ownerId: String(id),
            members: [String(id)],
            joinRequirement: Number(reqEssence) || 0,
            specialElement: randEl
        });

        const savedGuild = await newGuild.save();
        user.guildId = savedGuild._id;
        user.essence -= 5000;
        await user.save();

        res.json({ text: `🏰 **Guild ${name} Founded!**\nSpecialty: **${randEl}**\nOwner: <@${id}>\n\n*5,000 Essence deducted.*` });
    } catch (e) { res.json({ text: "❌ Name taken or database error." }); }
});

app.post('/guild_join', async (req, res) => {
    const { id, guildName } = req.body;
    const user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    const guild = await Guild.findOne({ name: guildName });

    if (user.guildId) return res.json({ text: "❌ Leave your current guild first." });
    if (!guild) return res.json({ text: "❌ Guild not found." });
    if (user.essence < guild.joinRequirement) return res.json({ text: `❌ This guild requires ${guild.joinRequirement} Essence.` });

    guild.members.push(String(id));
    user.guildId = guild._id;
    await guild.save();
    await user.save();
    res.json({ text: `✅ Successfully joined **${guild.name}**!` });
});

app.post('/guild_kick', async (req, res) => {
    const { id, targetId } = req.body;
    const guild = await Guild.findOne({ ownerId: String(id) });

    if (!guild) return res.json({ text: "❌ Only the Guild Owner can kick members." });
    
    guild.members = guild.members.filter(m => m !== String(targetId));
    await User.updateOne({ discordId: String(targetId) }, { guildId: null });
    await guild.save();

    res.json({ text: `👢 <@${targetId}> has been removed from the guild.` });
});

// --- BLACK MARKET ---

app.post('/black_market', async (req, res) => {
    const { id } = req.body;
    let user = await User.findOne({ discordId: String(id) });
    if (!user || user.essence < 1000) return res.json({ text: "❌ [GATEKEEPER]: 'Scram, kid. 1,000 Essence for a look inside.'" });

    user.essence -= 1000;
    await user.save();

    try {
        const market = await askGemini(`Generate 3 illegal monster items. Format: {"items": [{"n": "Name", "d": "Short Desc", "p": 800}]}`);
        let list = `🌑 **THE BLACK MARKET** 🌑\n*Entry Fee Paid (💰 -1,000)*\n\n`;
        market.items.forEach(i => {
            list += `🔹 **${i.n}** | 💰 ${i.p}\n_${i.d}_\n\n`;
        });
        res.json({ text: list });
    } catch (e) { res.json({ text: "⚠️ Market vanished into the shadows. Try again." }); }
});

// --- CORE ENGINE ---

app.post('/spawn', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    try {
        const data = await askGemini(`Create monster: ${req.body.description}. Format: {"name":"N","element":"E","elLore":"L","atk":50,"def":30,"hp":250,"bio":"B"}`);
        let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
        const monster = { ...data, level: 1, emoji: elementProfiles[data.element.toLowerCase()] || "💎" };
        user.monsters.push(monster);
        user.markModified('monsters');
        await user.save();
        res.json({ text: `${monster.emoji} **${monster.name}** Materialized!` });
    } catch (e) { res.json({ text: "❌ Spawn error." }); }
});

app.post('/collection', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) });
    if (!user || user.monsters.length === 0) return res.json({ text: "📭 Empty." });
    let list = `📂 **Bestiary** | 💰 ${user.essence}\n\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.name} (Lv.${m.level})\n`;
    });
    res.json({ text: list });
});

app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid monster." });

    const pMon = user.monsters[idx];
    try {
        const battle = await askGemini(`Narate a fight: Player (${pMon.name}) vs AI Rival. Stats: Atk ${pMon.atk}. Format: {"en":"EnemyName","nar":"3 sentences","win":true}`);
        if (battle.win) user.essence += 250;
        await user.save();
        res.json({ text: `⚔️ **${pMon.name} vs ${battle.en}**\n\n${battle.nar}\n\n${battle.win ? "🏆 +250 Essence" : "💀 Defeat"}` });
    } catch (e) { res.json({ text: "⚠️ Battle error." }); }
});

app.post('/claim', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    const now = new Date();
    if (now - user.lastClaimed < 86400000) return res.json({ text: "⏳ Recharging." });
    user.essence += 500;
    user.lastClaimed = now;
    await user.save();
    res.json({ text: "✨ +500 Essence claimed!" });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => {
    app.listen(PORT, () => console.log(`🚀 Engine Online`));
});
