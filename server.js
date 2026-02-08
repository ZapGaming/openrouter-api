const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios'); // REPLACED Google SDK with Axios
require('dotenv').config();

const app = express();
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

// --- NEW HELPER: TALK TO YOUR CUSTOM PROXY ---
async function askProxy(prompt) {
    try {
        // We use 'tier: high' (Gemini) or 'mid' (GPT) for best JSON results
        const response = await axios.post(process.env.PROXY_URL, {
            prompt: prompt + ". CRITICAL: RETURN RAW JSON ONLY. NO MARKDOWN, NO EXPLANATION, NO BACKTICKS.",
            tier: 'mid', 
            persona: "You are a Game Backend API. You are incapable of speaking normal text. You only output valid JSON data."
        }, {
            headers: { 
                'Authorization': `Bearer ${process.env.PROXY_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000 // 15 second timeout to prevent hanging
        });

        // The proxy returns { ... response: "string content" ... }
        let text = response.data.response;
        
        // Sanitize: Remove ```json and ``` wrapper if the model adds them
        text = text.trim().replace(/```json|```/g, "");
        
        return JSON.parse(text);

    } catch (e) {
        console.error("PROXY ERROR:", e.response ? e.response.data : e.message);
        // Fallback glitch item if API fails/timeout
        return { 
            name: "404 Glitch", 
            element: "glitch",
            en: "Connection Entity", 
            nar: "The connection to the ether severed... a glitch appears!", 
            win: false, atk: 10, hp: 100, 
            bio: "A being formed from packet loss." 
        };
    }
}

// --- CORE GAMEPLAY ---

app.post('/spawn', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    try {
        const data = await askProxy(`Create a unique monster based on: ${req.body.description || "Random Entity"}. Elements: Inferno, Abyssal, Glitch, Chrono, Bio-hazard. Format: {"name":"N","element":"E","elLore":"L","atk":65,"def":40,"hp":320,"bio":"B"}`);
        let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
        const monster = { ...data, level: 1, emoji: elementProfiles[data.element.toLowerCase()] || "💎" };
        user.monsters.push(monster);
        user.markModified('monsters');
        await user.save();
        res.json({ text: `${monster.emoji} **${monster.name}** Materialized!\n**Type:** ${monster.element}\n*${monster.bio}*` });
    } catch (e) { res.json({ text: "⚠️ Spawn failed." }); }
});

app.post('/collection', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) });
    if (!user || user.monsters.length === 0) return res.json({ text: "📭 Empty." });
    let list = `📂 **Bestiary** | 💰 ${user.essence}\n━━━━━━━━━━\n`;
    user.monsters.forEach((m, i) => list += `**[${i + 1}]** ${m.name} (Lv.${m.level}) | ⚔️ ${m.atk} HP: ${m.hp}\n`);
    res.json({ text: list });
});

app.post('/battle', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid selection." });
    const pMon = user.monsters[idx];
    const rngFactor = Math.floor(Math.random() * 200) - 50;
    const winChance = (pMon.atk + rngFactor) > 85;

    try {
        const battle = await askProxy(`Combat: ${pMon.name} vs a unique random horror. NOT ${pMon.name}. Format: {"en":"EnemyName","nar":"Action description","win":${winChance}}`);
        let reward = 0;
        if (battle.win) {
            reward = Math.floor(Math.random() * 300) + 150;
            user.essence += reward;
            await user.save();
        }
        res.json({ text: `⚔️ **ARENA: ${pMon.name} vs ${battle.en}**\n\n${battle.nar}\n\n${battle.win ? `🏆 **VICTORY!** +${reward} Essence.` : "💀 **DEFEAT.**"}` });
    } catch (e) { res.json({ text: "⚠️ Arena glitch." }); }
});

// --- EVOLVE & MERGE ---

app.post('/evolve', async (req, res) => {
    const id = req.body.id || req.body.user_id;
    const user = await User.findOne({ discordId: String(id) });
    const idx = parseInt(req.body.monsterIndex) - 1;
    if (!user || !user.monsters[idx] || user.essence < 1000) return res.json({ text: "❌ Need 1000 Essence." });

    const m = user.monsters[idx];
    const evo = await askProxy(`Evolve ${m.name} (${m.element}) into a god-tier version. Format: {"name":"N","atk":${m.atk + 50},"hp":${m.hp + 150},"bio":"New Bio"}`);
    user.monsters[idx] = { ...m, ...evo, level: m.level + 1 };
    user.essence -= 1000;
    user.markModified('monsters');
    await user.save();
    res.json({ text: `✨ **EVOLUTION!** **${m.name}** mutated into **${evo.name}**!` });
});

app.post('/merge', async (req, res) => {
    const { id, idx1, idx2 } = req.body;
    const user = await User.findOne({ discordId: String(id) });
    const i1 = parseInt(idx1) - 1; const i2 = parseInt(idx2) - 1;
    if (!user || !user.monsters[i1] || !user.monsters[i2] || i1 === i2) return res.json({ text: "❌ Select 2 unique monsters." });

    const m1 = user.monsters[i1]; const m2 = user.monsters[i2];
    const fusion = await askProxy(`Fuse ${m1.name} and ${m2.name}. Format: {"name":"N","element":"Hybrid","atk":${m1.atk + m2.atk},"hp":${m1.hp + m2.hp}}`);
    user.monsters = user.monsters.filter((_, i) => i !== i1 && i !== i2);
    user.monsters.push({ ...fusion, level: 1, emoji: "🧬" });
    user.markModified('monsters');
    await user.save();
    res.json({ text: `🧬 **FUSION COMPLETE!** Created **${fusion.name}**!` });
});

// --- GUILD SYSTEM (No AI, unchanged) ---

app.post('/guild_create', async (req, res) => {
    const { id, name, reqEssence } = req.body;
    let user = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    if (user.guildId || user.essence < 5000) return res.json({ text: "❌ Already in guild or need 5k Essence." });
    const guild = await Guild.create({ name, ownerId: String(id), members: [String(id)], joinRequirement: Number(reqEssence) });
    user.guildId = guild._id; user.essence -= 5000;
    await user.save();
    res.json({ text: `🏰 **${name}** Founded!` });
});

app.post('/guild_join', async (req, res) => {
    const { id, guildName } = req.body;
    const g = await Guild.findOne({ name: guildName });
    if (!g) return res.json({ text: "❌ Not found." });
    const u = await User.findOne({ discordId: String(id) }) || new User({ discordId: String(id) });
    if (u.guildId) return res.json({ text: "❌ Leave your guild first." });
    if (u.essence < g.joinRequirement) return res.json({ text: "❌ Too poor to join." });
    g.members.push(String(id)); u.guildId = g._id;
    await g.save(); await u.save();
    res.json({ text: `✅ Joined **${g.name}**!` });
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
    if (user.essence < amount) return res.json({ text: "❌ Low essence." });
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

app.post('/guild_kick', async (req, res) => {
    const { id, targetId } = req.body;
    const g = await Guild.findOne({ ownerId: String(id) });
    if (!g) return res.json({ text: "❌ Only the Guild Owner can kick members." });
    
    if (String(id) === String(targetId)) return res.json({ text: "❌ You cannot kick yourself." });

    g.members = g.members.filter(m => m !== String(targetId));
    await User.updateOne({ discordId: String(targetId) }, { guildId: null });
    await g.save();
    
    res.json({ text: `👢 **KICKED:** <@${targetId}> has been removed from **${g.name}**.` });
});

app.post('/raid', async (req, res) => {
    const { id, monsterIndex } = req.body;
    let boss = await Boss.findOne({ active: true });
    if (!boss) boss = await Boss.create({ name: "Rift Maw", hp: 10000, maxHp: 10000 });
    const user = await User.findOne({ discordId: String(id) });
    const pMon = user.monsters[parseInt(monsterIndex)-1];
    if (!pMon) return res.json({ text: "❌ Selection error." });
    const dmg = Math.floor((pMon.atk * (Math.random() * 1.5)) + 30);
    boss.hp -= dmg; user.essence += 50;
    if (boss.hp <= 0) { user.essence += 5000; boss.active = false; }
    await boss.save(); await user.save();
    res.json({ text: `👹 **BOSS: ${boss.name}**\n❤️ HP: ${boss.hp}/${boss.maxHp}\n💥 Dealt **${dmg} DMG**!` });
});

app.post('/claim', async (req, res) => {
    const user = await User.findOne({ discordId: String(req.body.id) }) || new User({ discordId: String(req.body.id) });
    if (new Date() - user.lastClaimed < 86400000) return res.json({ text: "⏳ Not yet." });
    user.essence += 500; user.lastClaimed = new Date();
    await user.save();
    res.json({ text: "✨ +500 Essence!" });
});

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI).then(() => app.listen(PORT));
