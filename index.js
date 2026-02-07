const express = require('express');
const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- RPG LOGIC HELPERS ---

const getElementRarity = (rank) => {
    const roll = Math.random() * 100;
    // High ranks (Grand Summoner/Mythic) get higher custom element chances
    const customThreshold = rank === "Mythic" ? 85 : 95; 
    
    if (roll > customThreshold) return "CUSTOM"; 
    if (roll > 75) return "RARE"; // Magic, Soul, Legend
    return "STANDARD"; // Fire, Water, Earth, Lightning
};

// --- CORE ENGINE ---

async function generateMonster(type, data) {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const rarity = getElementRarity(data.rank);
    
    let prompt = "";
    if (type === 'spawn') {
        prompt = `Act as a monster RPG engine. 
        User Rank: ${data.rank}
        Element Rarity Tier: ${rarity}
        Description: "${data.description}"
        
        Rules:
        1. If tier is CUSTOM, invent a new element (e.g. Glitch, Neon, Void).
        2. If tier is RARE, use Soul, Magic, or Legend.
        3. If tier is STANDARD, use Fire, Water, Earth, or Lightning.
        
        Return ONLY JSON:
        {
          "name": "Name",
          "element": "Element",
          "stats": {"hp": 100, "atk": 25, "def": 20, "spd": 15},
          "bio": "One sentence lore.",
          "rarity": "${rarity}"
        }`;
    } else if (type === 'merge') {
        prompt = `Combine these two: ${data.m1} and ${data.m2}. 
        Create a hybrid with mixed stats and a new name. Return JSON structure as above.`;
    }

    try {
        const result = await model.generateContent(prompt);
        const jsonResponse = JSON.parse(result.response.text().replace(/```json|```/g, ""));
        
        // Format the final text for BotGhost to display
        const display = `👾 **${jsonResponse.name}** [${jsonResponse.rarity}]\n` +
                        `🧬 **Element:** ${jsonResponse.element}\n` +
                        `📊 **HP:** ${jsonResponse.stats.hp} | **ATK:** ${jsonResponse.stats.atk}\n` +
                        `📝 *${jsonResponse.bio}*`;
        
        return { text: display, raw: jsonResponse };
    } catch (e) {
        return { text: "❌ The portal collapsed. AI Error." };
    }
}

// --- API ENDPOINT ---

app.post('/monster', async (req, res) => {
    const response = await generateMonster(req.body.type, req.body);
    res.json(response);
});

app.listen(PORT, () => console.log(`Monster Engine Online on ${PORT}`));
