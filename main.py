import discord
from discord.ext import commands
import google.generativeai as genai
import random
import json
import os

# --- CONFIGURATION ---
TOKEN = os.getenv("DISCORD_TOKEN")
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# --- GAME CONSTANTS ---
ELEMENTS = ["Fire", "Water", "Earth", "Lightning"]
RARE_ELEMENTS = ["Magic", "Soul", "Legend"]

# --- AI CORE ---
async def generate_monster_dna(description, is_custom_allowed=False):
    # Determine Rarity
    chance = random.random()
    if is_custom_allowed and chance < 0.05: # 5% chance for a purely AI-invented element
        element_logic = "Create a completely new, unique element type based on the description."
    elif chance < 0.20:
        element_logic = f"Pick one rare element from this list: {RARE_ELEMENTS}."
    else:
        element_logic = f"Pick one standard element from this list: {ELEMENTS}."

    prompt = f"""
    Act as a monster RPG engine. User Description: "{description}"
    {element_logic}
    
    Return ONLY a JSON object:
    {{
      "name": "Unique Name",
      "element": "The Element",
      "stats": {{"hp": 100, "atk": 20, "def": 15, "spd": 10}},
      "rarity": "Common/Rare/Unique",
      "ability": "Move Name",
      "bio": "One sentence lore."
    }}
    """
    
    response = model.generate_content(prompt)
    # Clean the response string to ensure it's valid JSON
    clean_json = response.text.replace("```json", "").replace("```", "").strip()
    return json.loads(clean_json)

# --- COMMANDS ---

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.name} | Monster Engine Active")

@bot.command()
async def spawn(ctx, *, description: str):
    """Creates a new monster based on your description!"""
    await ctx.send(f"🔮 Calling the void to birth a creature for `{ctx.author.name}`...")
    
    try:
        # High rank or lucky users get 'is_custom_allowed=True'
        monster = await generate_monster_dna(description, is_custom_allowed=True)
        
        # Color coding based on rarity
        color = 0xFFD700 if monster['rarity'] != "Common" else 0x7289DA
        
        embed = discord.Embed(title=f"👾 {monster['name']}", color=color, description=monster['bio'])
        embed.add_field(name="🧬 Element", value=f"**{monster['element']}**", inline=True)
        embed.add_field(name="⭐ Rarity", value=monster['rarity'], inline=True)
        embed.add_field(name="⚔️ Ability", value=monster['ability'], inline=False)
        embed.add_field(name="📊 Stats", value=f"HP: {monster['stats']['hp']} | ATK: {monster['stats']['atk']} | DEF: {monster['stats']['def']}", inline=False)
        
        await ctx.send(embed=embed)
        # Note: Here is where you'd trigger the AI image generation tool
    except Exception as e:
        await ctx.send(f"⚠️ The ritual failed: {e}")

@bot.command()
async def battle(ctx, monster_name: str):
    """(WIP) Battle logic would go here, pulling from a database."""
    await ctx.send(f"⚔️ {monster_name} is looking for a fight! (Battle system integration coming next.)")

# --- START BOT ---
if __name__ == "__main__":
    bot.run(TOKEN)
