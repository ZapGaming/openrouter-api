const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- initialization ---
const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static('public'));

// --- temporary link storage ---
const activeTokens = new Map();

// --- mongodb schemas ---
const userSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 500 },
    rank: { type: String, default: "novice" },
    monsters: [{
        name: String,
        element: String,
        rarity: String,
        level: { type: Number, default: 1 },
        atk: Number,
        hp: Number,
        bio: String
    }]
});

const User = mongoose.model('User', userSchema);

// --- world boss state ---
let worldBoss = {
    name: "the monolith of void",
    hp: 50000,
    maxHp: 50000,
    element: "legend"
};

// --- helper: gemini engine ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// --- routes: discord integration ---

// endpoint for /spawn
app.post('/monster', async (req, res) => {
    const { type, description, rank, id } = req.body;
    
    try {
        const prompt = `act as a monster rpg engine. create a monster based on: ${description}. 
        rank: ${rank}. return json: {"name": "name", "element": "element", "stats": {"hp": 100, "atk": 20}, "rarity": "common", "bio": "lore"}`;
        
        const monsterData = await askGemini(prompt);
        
        // save to mongodb
        let user = await User.findOne({ discordId: id });
        if (!user) user = new User({ discordId: id });
        
        const newMonster = {
            name: monsterData.name,
            element: monsterData.element,
            rarity: monsterData.rarity,
            atk: monsterData.stats.atk,
            hp: monsterData.stats.hp,
            bio: monsterData.bio
        };
        
        user.monsters.push(newMonster);
        await user.save();

        const display = `👾 **${newMonster.name}** [${newMonster.rarity}]\n🧬 **element:** ${newMonster.element}\n📝 *${newMonster.bio}*`;
        res.json({ text: display });
    } catch (e) {
        res.json({ text: "❌ portal error: ai failed to birth creature." });
    }
});

// endpoint for /dashboard link generation
app.post('/generate-link', (req, res) => {
    const { id } = req.body;
    const token = crypto.randomBytes(16).toString('hex');
    
    activeTokens.set(token, {
        discordId: id,
        expires: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
    });

    res.json({ text: `🔗 portal open for 2h: https://${req.get('host')}/dash/${token}` });
});

// --- routes: web dashboard ---

app.get('/dash/:token', async (req, res) => {
    const session = activeTokens.get(req.params.token);
    if (!session || Date.now() > session.expires) {
        return res.send("❌ link expired. use /dashboard in discord.");
    }

    const user = await User.findOne({ discordId: session.discordId });
    if (!user) return res.send("user not found. spawn a monster first!");

    res.render('dashboard', { user, boss: worldBoss });
});

// route for attacking the boss via website
app.post('/attack-boss', async (req, res) => {
    const { token, monsterId } = req.body;
    const session = activeTokens.get(token);
    if (!session) return res.json({ success: false });

    const user = await User.findOne({ discordId: session.discordId });
    const monster = user.monsters.id(monsterId);
    
    const damage = monster.atk + Math.floor(Math.random() * 10);
    worldBoss.hp -= damage;

    res.json({ 
        success: true, 
        damage, 
        bossHp: worldBoss.hp,
        msg: `${monster.name} dealt ${damage} to the boss!` 
    });
});

// --- startup ---
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("🌌 database linked. world engine online.");
        app.listen(PORT);
    })
    .catch(err => console.error("❌ database connection failed:", err));
