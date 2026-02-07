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
    specialElement: { type: String, default: "Void" },
    activeBuffs: { type: Array, default: [] } 
});

const User = mongoose.model('User', userSchema);
const Guild = mongoose.model('Guild', guildSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️", "solar": "☀️"
};

// --- AI CORE HELPER ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt + ". RETURN RAW JSON ONLY. NO MARKDOWN.");
    let text = result.response.text().replace(/```json|```/g, "").trim();
    return JSON.parse(text);
}

// --- CORE GAMEPLAY ENDPOINTS ---

app.post('/spawn', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    try {
        const data = await askGemini(`Create monster: ${req.body.description}. Format: {"name":"N","element":"E","elLore":"L","atk":55,"def":35,"hp":280,"bio":"B"}`);
        let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
        
        const monster = { ...data, level: 1, emoji: elementProfiles[data.element.toLowerCase()] || "💎" };
        user.monsters.push(monster);
        user.markModified('monsters');
        await user.save();
        
        res.json({ text: `${monster.emoji} **${monster.name}** has crossed the rift!\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n\n*${monster.bio}*` });
    } catch (e) { res.json({ text: "⚠️ Rift instability. Try again." }); }
});

app.post('/collection', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    if (!user || user.monsters.length === 0) return res.json({ text: "📭 Your bestiary is empty." });

    let list = `📂 **Digital Bestiary** | 💰 Essence: ${user.essence}\n━━━━━━━━━━━━━━━━━━\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.emoji || '👾'} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} | ❤️ ${m.hp} HP*\n\n`;
    });
    res.json({ text: list });
});

app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    
    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid selection." });
    const pMon = user.monsters[idx];

    try {
        const battle = await askGemini(`Narrate a fight: ${pMon.name} (Atk ${pMon.atk}) vs a random Rival. Format: {"en":"EnemyName","nar":"3 sentence epic description","win":true}`);
        
        let reward = 250;
        if (battle.win) {
            user.essence += reward;
            await user.save();
        }

        res.json({ text: `⚔️ **ARENA: ${pMon.name} vs ${battle.en}**\n\n${battle.nar}\n\n${battle.win ? `🏆 **VICTORY!** +${reward} Essence.` : "💀 **DEFEAT.** Your monster retreated."}` });
    } catch (e) { res.json({ text: "⚠️ The Arena is glitched." }); }
});

app.post('/claim', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    
    const now = new Date();
    if (now - user.lastClaimed < 86400000) return res.json({ text: "⏳ Core is still recharging. Return tomorrow." });

    user.essence += 500;
    user.lastClaimed = now;
    await user.save();
    res.json({ text: `✨ **Essence Infused!**\n+500 added. Total: 💰 **${user.essence}**` });
});

// --- EVOLUTION & FUSION ---

app.post('/evolve', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;

    if (!user || !user.monsters[idx] || user.essence < 1000) return res.json({ text: "❌ Need 1000 Essence." });

    const m = user.monsters[idx];
    const evo = await askGemini(`Evolve ${m.name}. Format: {"name":"NewName","atk":${m.atk + 40},"hp":${m.hp + 120},"bio":"Evo Bio"}`);
    
    user.monsters[idx] = { ...m, ...evo, level: m.level + 1 };
    user.essence -= 1000;
    user.markModified('monsters');
    await user.save();
    res.json({ text: `✨ **EVOLUTION!** ${m.name} -> **${evo.name}**!` });
});

app.post('/merge', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const i1 = parseInt(req.body.idx1) - 1;
    const i2 = parseInt(req.body.idx2) - 1;

    if (!user || !user.monsters[i1] || !user.monsters[i2] || i1 === i2) return res.json({ text: "❌ Select 2 different monsters." });

    const m1 = user.monsters[i1]; const m2 = user.monsters[i2];
    const fusion = await askGemini(`Fuse ${m1.name} and ${m2.name}. Format: {"name":"F","element":"H","atk":${m1.atk + m2.atk},"hp":${m1.hp + m2.hp}}`);

    user.monsters = user.monsters.filter((_, i) => i !== i1 && i !== i2);
    user.monsters.push({ ...fusion, level: 1, emoji: "🧬" });
    user.markModified('monsters');
    await user.save();
    res.json({ text: `🧬 **FUSION COMPLETE!** Created **${fusion.name}**!` });
});

// --- GUILD SYSTEM ---

app.post('/guild_create', async (req, res) => {
    const { id, name, reqEssence } = req.body;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    if (user.guildId) return res.json({ text: "❌ Already in a guild." });
    if (user.essence < 5000) return res.json({ text: "❌ Need 5,000 Essence." });

    const elements = ["Nebula", "Titan", "Chrono", "Spectre", "Solaris"];
    const guild = new Guild({
        name, ownerId: String(id), members: [String(id)], 
        joinRequirement: Number(reqEssence), 
        specialElement: elements[Math.floor(Math.random() * elements.length)]
    });

    const saved = await guild.save();
    user.guildId = saved._id;
    user.essence -= 5000;
    await user.save();
    res.json({ text: `🏰 **Guild ${name}** created! specialty: **${saved.specialElement}**` });
});

app.post('/guild_stats', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) });
    if (!user?.guildId) return res.json({ text: "❌ No guild." });
    const g = await Guild.findById(user.guildId);
    res.json({ text: `🏰 **${g.name}**\n⭐ Lv: ${g.level} | 💰 Vault: ${g.vault}\n💠 Specialty: ${g.specialElement}\n👥 Members: ${g.members.length}` });
});

app.post('/guild_deposit', async (req, res) => {
    const { id, amount } = req.body;
    let user = await User.findOne({ discordId: String(id) });
    if (user.essence < amount) return res.json({ text: "❌ Not enough Essence." });
    user.essence -= amount;
    await Guild.findByIdAndUpdate(user.guildId, { $inc: { vault: amount } });
    await user.save();
    res.json({ text: `✅ Deposited ${amount} into Vault.` });
});

app.post('/guild_shop', async (req, res) => {
    const { id, buyItem } = req.body;
    const user = await User.findOne({ discordId: String(id) });
    const g = await Guild.findById(user.guildId);
    if (!buyItem) return res.json({ text: "🛒 **GUILD SHOP**\n1. `training` (5k) - XP Buff\n2. `alchemy` (8k) - Essence Buff\n\nUse `/guild_shop item_id`" });
    
    if (g.ownerId !== String(id)) return res.json({ text: "❌ Owner only." });
    const price = buyItem === 'training' ? 5000 : 8000;
    if (g.vault < price) return res.json({ text: "❌ Vault empty." });

    g.vault -= price;
    g.activeBuffs.push(buyItem);
    await g.save();
    res.json({ text: `🔥 Upgrade **${buyItem}** purchased!` });
});

app.post('/guild_join', async (req, res) => {
    const { id, guildName } = req.body;
    const g = await Guild.findOne({ name: guildName });
    const u = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    if (u.essence < g.joinRequirement) return res.json({ text: "❌ Requirement not met." });
    g.members.push(String(id));
    u.guildId = g._id;
    await g.save(); await u.save();
    res.json({ text: `✅ Joined ${g.name}!` });
});

app.post('/guild_kick', async (req, res) => {
    const g = await Guild.findOne({ ownerId: String(req.body.id) });
    g.members = g.members.filter(m => m !== String(req.body.targetId));
    await User.updateOne({ discordId: String(req.body.targetId) }, { guildId: null });
    await g.save();
    res.json({ text: "👢 Kicked." });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
