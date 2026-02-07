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

const bossSchema = new mongoose.Schema({
    name: { type: String, default: "The World Eater" },
    hp: { type: Number, default: 10000 },
    maxHp: { type: Number, default: 10000 },
    active: { type: Boolean, default: true }
});

const User = mongoose.model('User', userSchema);
const Guild = mongoose.model('Guild', guildSchema);
const Boss = mongoose.model('Boss', bossSchema);

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾"
};

// --- CHAOTIC AI HELPER ---
async function askGemini(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
        const result = await model.generateContent(prompt + ". CRITICAL: RETURN RAW JSON ONLY. NO MARKDOWN, NO BACKTICKS.");
        let text = result.response.text().trim().replace(/```json|```/g, "");
        return JSON.parse(text);
    } catch (e) {
        console.error("AI ERROR, FALLING BACK:", e);
        return { 
            name: "Glitched Entity", en: "Rift Anomaly", 
            nar: "The reality around you cracked, forcing a desperate struggle!", 
            win: Math.random() > 0.5 
        };
    }
}

// --- CORE GAMEPLAY ---

app.post('/spawn', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const desc = req.body.description || "A random horror";
    try {
        const data = await askGemini(`Create a unique monster based on: ${desc}. Elements: Inferno, Abyssal, Glitch, Chrono, Bio-hazard. Format: {"name":"N","element":"E","elLore":"L","atk":65,"def":40,"hp":320,"bio":"B"}`);
        let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
        
        const monster = { ...data, level: 1, emoji: elementProfiles[data.element.toLowerCase()] || "💎" };
        user.monsters.push(monster);
        user.markModified('monsters');
        await user.save();
        
        res.json({ text: `${monster.emoji} **${monster.name}** has crossed the rift!\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n\n*${monster.bio}*` });
    } catch (e) { res.json({ text: "⚠️ Spawn failed. The rift is unstable." }); }
});

app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    
    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Select a valid monster." });
    const pMon = user.monsters[idx];

    // Wobbly Stat System (RNG swing of -50 to +150)
    const rngFactor = Math.floor(Math.random() * 200) - 50;
    const winChance = (pMon.atk + rngFactor) > 80;

    try {
        const battle = await askGemini(`Narrate a fight: ${pMon.name} vs a unique random enemy. THE ENEMY MUST NOT BE ${pMon.name}. Format: {"en":"EnemyName","nar":"Action description","win":${winChance}}`);
        
        let reward = 0;
        if (battle.win) {
            reward = Math.floor(Math.random() * 350) + 150; // Random payout
            user.essence += reward;
            await user.save();
        }

        res.json({ text: `⚔️ **ARENA: ${pMon.name} vs ${battle.en}**\n\n${battle.nar}\n\n${battle.win ? `🏆 **VICTORY!** +${reward} Essence.` : "💀 **DEFEAT.**"}` });
    } catch (e) { res.json({ text: "⚠️ Arena glitch. Combat canceled." }); }
});

app.post('/raid', async (req, res) => {
    const { id, monsterIndex } = req.body;
    let boss = await Boss.findOne({ active: true });
    if (!boss) boss = await Boss.create({ name: "The Void Titan", hp: 10000, maxHp: 10000 });

    const user = await User.findOne({ discordId: String(id) });
    const pMon = user.monsters[parseInt(monsterIndex)-1];
    if (!pMon) return res.json({ text: "❌ Monster not found." });

    const dmg = Math.floor((pMon.atk * (Math.random() * 1.5)) + 30);
    boss.hp -= dmg;
    user.essence += 50; 

    let msg = `👹 **WORLD BOSS: ${boss.name}**\n❤️ HP: ${boss.hp}/${boss.maxHp}\n\n**${pMon.name}** attacked for **${dmg} DMG**!`;

    if (boss.hp <= 0) {
        user.essence += 5000;
        boss.active = false;
        msg += `\n\n🏆 **FATAL BLOW!** You killed the boss and earned **5,000 Essence**!`;
    }
    await boss.save(); await user.save();
    res.json({ text: msg });
});

app.post('/collection', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) });
    if (!user || user.monsters.length === 0) return res.json({ text: "📭 Empty." });
    let list = `📂 **Bestiary** | 💰 ${user.essence}\n━━━━━━━━━━\n`;
    user.monsters.forEach((m, i) => list += `**[${i + 1}]** ${m.name} (Lv.${m.level})\n`);
    res.json({ text: list });
});

// --- GUILD SYSTEM ---

app.post('/guild_create', async (req, res) => {
    const { id, name, reqEssence } = req.body;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    if (user.guildId || user.essence < 5000) return res.json({ text: "❌ Already in a guild or too poor." });

    const guild = await Guild.create({ name, ownerId: String(id), members: [String(id)], joinRequirement: Number(reqEssence) });
    user.guildId = guild._id;
    user.essence -= 5000;
    await user.save();
    res.json({ text: `🏰 **${name}** has been founded!` });
});

app.post('/guild_stats', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) });
    const g = await Guild.findById(user?.guildId);
    if (!g) return res.json({ text: "❌ No guild." });
    res.json({ text: `🏰 **${g.name}**\n💰 Vault: ${g.vault}\n👥 Members: ${g.members.length}\n✨ Buffs: ${g.activeBuffs.join(", ") || "None"}` });
});

app.post('/guild_deposit', async (req, res) => {
    const { id, amount } = req.body;
    const user = await User.findOne({ discordId: String(id) });
    if (user.essence < amount) return res.json({ text: "❌ Insufficient funds." });
    user.essence -= amount;
    await Guild.findByIdAndUpdate(user.guildId, { $inc: { vault: amount } });
    await user.save();
    res.json({ text: `✅ Deposited ${amount}.` });
});

app.post('/guild_shop', async (req, res) => {
    const { id, buyItem } = req.body;
    const user = await User.findOne({ discordId: String(id) });
    const g = await Guild.findById(user.guildId);
    if (!buyItem) return res.json({ text: "🛒 **GUILD SHOP**\n- `training` (5k)\n- `alchemy` (8k)\n- `shrine` (15k)" });
    
    const prices = { training: 5000, alchemy: 8000, shrine: 15000 };
    if (g.vault < prices[buyItem]) return res.json({ text: "❌ Vault too low." });

    g.vault -= prices[buyItem];
    g.activeBuffs.push(buyItem);
    await g.save();
    res.json({ text: `🔥 Buff **${buyItem}** activated!` });
});

// --- UTILS ---
app.post('/claim', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) }) || new User({ discordId: String(req.body.id) });
    if (new Date() - user.lastClaimed < 86400000) return res.json({ text: "⏳ Recharge in progress." });
    user.essence += 500;
    user.lastClaimed = new Date();
    await user.save();
    res.json({ text: "✨ +500 Essence claimed!" });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
