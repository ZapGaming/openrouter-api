const express = require('express');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const DB_PATH = path.join(__dirname, 'database.json');

app.use(express.json());

// --- LOCAL DB HELPERS ---
// This replaces MongoDB. It reads/writes to a file on your Render server.
function readDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({ users: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const elementProfiles = {
    "inferno": "🔥", "abyssal": "🌑", "cyber": "📡", "void": "🌀", 
    "celestial": "✨", "bio-hazard": "☣️", "plasma": "⚡", "glitch": "👾",
    "aura": "🌸", "spectre": "👻", "chrono": "⏳", "vortex": "🌪️"
};

// --- AI CORE ---
async function askGemini(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const strictPrompt = `${prompt}. RETURN ONLY RAW JSON. NO CODE BLOCKS.
    FORMAT: {"name": "Name", "element": "Type", "elLore": "Lore", "atk": 40, "def": 20, "hp": 200, "bio": "Bio"}`;
    
    const result = await model.generateContent(strictPrompt);
    let text = result.response.text().replace(/```json|```/g, "").trim();
    const data = JSON.parse(text);
    
    return {
        ...data,
        atk: Number(data.atk) || 45,
        hp: Number(data.hp) || 250,
        level: 1,
        emoji: elementProfiles[String(data.element).toLowerCase()] || "💎"
    };
}

// --- ENDPOINTS ---

app.post('/spawn', async (req, res) => {
    const { id, description } = req.body;
    const userId = String(id);

    try {
        const monster = await askGemini(`Create monster: ${description}`);
        const db = readDB();

        if (!db.users[userId]) {
            db.users[userId] = { essence: 1000, monsters: [], lastClaimed: 0 };
        }

        db.users[userId].monsters.push(monster);
        writeDB(db);

        res.json({
            text: `${monster.emoji} **${monster.name}** has crossed the rift!\n\n**Type:** ${monster.element}\n**Lore:** ${monster.elLore}\n**Stats:** ❤️ ${monster.hp} | ⚔️ ${monster.atk}\n\n*${monster.bio}*`
        });
    } catch (e) {
        res.json({ text: "⚠️ Rift error. Try again." });
    }
});

app.post('/collection', (req, res) => {
    const { id } = req.body;
    const db = readDB();
    const user = db.users[String(id)];

    if (!user || user.monsters.length === 0) {
        return res.json({ text: "📭 Your collection is empty. Use `/spawn`." });
    }

    let list = `📂 **Digital Bestiary [Total: ${user.monsters.length}]**\n💰 Essence: ${user.essence}\n\n`;
    user.monsters.forEach((m, i) => {
        list += `**[${i + 1}]** ${m.emoji} **${m.name}** (Lv.${m.level})\n   *${m.element} | ⚔️ ${m.atk} | ❤️ ${m.hp} HP*\n\n`;
    });

    res.json({ text: list });
});

app.post('/claim', (req, res) => {
    const { id } = req.body;
    const db = readDB();
    const userId = String(id);

    if (!db.users[userId]) db.users[userId] = { essence: 1000, monsters: [], lastClaimed: 0 };

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    if (now - db.users[userId].lastClaimed < day) {
        return res.json({ text: "⏳ Core recharging. Try again later." });
    }

    db.users[userId].essence += 500;
    db.users[userId].lastClaimed = now;
    writeDB(db);

    res.json({ text: `✨ **Essence Infused!**\n+500 added. Total: 💰 **${db.users[userId].essence}**` });
});

app.post('/battle', async (req, res) => {
    const { id, monsterIndex } = req.body;
    const db = readDB();
    const user = db.users[String(id)];
    const idx = parseInt(monsterIndex) - 1;

    if (!user || !user.monsters[idx]) return res.json({ text: "❌ Invalid monster." });

    const pMon = user.monsters[idx];
    const enemy = await askGemini(`Rival for ${pMon.name}`);

    let log = `⚔️ **ARENA: ${pMon.name} vs ${enemy.name}**\n\n`;
    if (pMon.atk >= (enemy.atk * 0.8)) {
        user.essence += 250;
        log += `🏆 **Victory!** +250 Essence.`;
    } else {
        log += `💀 **Defeat.**`;
    }

    writeDB(db);
    res.json({ text: log });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 LOCAL STORAGE ENGINE LIVE ON ${PORT}`));
