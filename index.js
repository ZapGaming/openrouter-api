const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- HELPER: ELEMENT LOGIC ---
function getElementLogic() {
    const chance = Math.random();
    if (chance < 0.07) return "CUSTOM: Ignore standard elements. Invent a completely new, unique element type based on the description.";
    if (chance < 0.25) return "RARE: Choose one from [Magic, Soul, Legend].";
    return "STANDARD: Choose one from [Fire, Water, Earth, Lightning].";
}

// --- CORE LOGIC ---
async function handleMonsterAction(type, data) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    let prompt = "";

    if (type === 'spawn') {
        prompt = `Act as a monster RPG engine. User Description: "${data.description}".
        Element Rule: ${getElementLogic()}
        Return ONLY JSON: {
            "name": "Name",
            "element": "Element Type",
            "stats": {"hp": 100, "atk": 20, "def": 15, "spd": 10},
            "rarity": "Common/Rare/Legendary",
            "ability": "Move Name",
            "bio": "One sentence lore."
        }`;
    } else if (type === 'merge') {
        prompt = `Combine these two monsters: ${data.m1.name} (Element: ${data.m1.element}) and ${data.m2.name} (Element: ${data.m2.element}).
        Mix their bios and create a new hybrid with combined stats. 
        Return ONLY JSON with the same structure as a spawn.`;
    }

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().replace(/```json|```/g, "").trim();
        return JSON.parse(responseText);
    } catch (e) {
        return { error: "AI logic failed." };
    }
}

// --- ROUTES ---
app.post('/monster', async (req, res) => {
    const result = await handleMonsterAction(req.body.type, req.body);
    // We send back a flat 'text' key so BotGhost can easily display it in one block
    const message = `👾 **${result.name}** [${result.rarity}]\n🧬 **Element:** ${result.element}\n📊 **Stats:** HP: ${result.stats.hp} | ATK: ${result.stats.atk}\n✨ **Ability:** ${result.ability}\n\n> ${result.bio}`;
    res.json({ text: message, raw: result });
});

app.listen(process.env.PORT || 3000);
