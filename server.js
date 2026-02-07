const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const activeTokens = new Map();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static('public'));

// 1. MONGODB SCHEMA
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 500 },
    rank: { type: String, default: "novice" },
    monsters: [{
        name: String,
        element: String,
        rarity: String,
        level: { type: Number, default: 1 },
        atk: { type: Number, default: 10 },
        hp: { type: Number, default: 100 },
        bio: String
    }]
});
const User = mongoose.model('User', userSchema);

// 2. WORLD BOSS STATE (Stored in memory for now)
let worldBoss = {
    name: "The Void Titan",
    hp: 100000,
    maxHp: 100000,
    element: "Void",
    rewards: 5000
};

// 3. AI HELPER FUNCTION
async function generateAIContent(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text().replace(/```json|```/g, "").trim());
}

// 4. DISCORD ENDPOINT: SPAWN
app.post('/monster', async (req, res) => {
    const { description, rank, id } = req.body;
    try {
        const prompt = `Create a monster RPG profile for: ${description}. Rank: ${rank}. 
        Return JSON ONLY: {"name": "string", "element": "string", "rarity": "string", "atk": number, "hp": number, "bio": "string"}`;
        
        const data = await generateAIContent(prompt);
        let user = await User.findOne({ discordId: id }) || new User({ discordId: id });
        
        user.monsters.push(data);
        await user.save();

        res.json({ text: `👾 **${data.name}** birthed!\n🧬 **Element:** ${data.element}\n📜 *${data.bio}*` });
    } catch (err) {
        res.status(500).json({ text: "The portal collapsed. AI failed to spawn." });
    }
});

// 5. DISCORD ENDPOINT: DASHBOARD LINK
app.post('/generate-link', (req, res) => {
    const { id } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    activeTokens.set(token, { discordId: id, expires: Date.now() + 7200000 }); // 2 hours
    res.json({ text: `🔗 **Secure Portal:** https://${req.get('host')}/dash/${token}` });
});

// 6. WEBSITE: DASHBOARD VIEW
app.get('/dash/:token', async (req, res) => {
    const session = activeTokens.get(req.params.token);
    if (!session || Date.now() > session.expires) return res.send("Token expired.");
    
    const user = await User.findOne({ discordId: session.discordId });
    res.render('dashboard', { user, boss: worldBoss, token: req.params.token });
});

// 7. WEBSITE: EVOLUTION LOGIC
app.post('/evolve', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    if (!session) return res.json({ success: false });

    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    if (user.essence < 300) return res.json({ success: false, msg: "Need 300 Essence" });

    const prompt = `Evolve ${monster.name} (${monster.element}). Level up! Return JSON: {"name": "new", "bio": "new", "hp": ${monster.hp + 50}, "atk": ${monster.atk + 15}}`;
    const data = await generateAIContent(prompt);

    Object.assign(monster, data);
    monster.level += 1;
    user.essence -= 300;
    await user.save();

    res.json({ success: true, monster });
});

// 8. WEBSITE: MERGING LOGIC
app.post('/merge', async (req, res) => {
    const { token, id1, id2 } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });

    const m1 = user.monsters.id(id1);
    const m2 = user.monsters.id(id2);

    const prompt = `Merge ${m1.name} and ${m2.name} into a hybrid. Return JSON: {"name": "string", "element": "hybrid", "atk": ${m1.atk + m2.atk}, "hp": ${m1.hp + m2.hp}, "bio": "string"}`;
    const data = await generateAIContent(prompt);

    user.monsters.pull(id1);
    user.monsters.pull(id2);
    user.monsters.push(data);
    await user.save();

    res.json({ success: true });
});

// 9. WEBSITE: WORLD BOSS ATTACK
app.post('/attack-boss', async (req, res) => {
    const { monsterId, token } = req.body;
    const session = activeTokens.get(token);
    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);

    worldBoss.hp -= monster.atk;
    user.essence += 10; // Reward for attacking
    await user.save();

    res.json({ success: true, bossHp: worldBoss.hp, damage: monster.atk });
});

// STARTUP
mongoose.connect(process.env.MONGO_URI).then(() => {
    app.listen(process.env.PORT || 3000, () => console.log("Digital World Engine Online"));
});
