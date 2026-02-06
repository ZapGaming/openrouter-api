import { serve } from "bun";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PORT = process.env.PORT || 3000;

// The "Knowledge Base" for the AI
const CHILLAX_CONTEXT = {
    faq_url: "https://chillax.inmoresentum.net/vencordfaq.html",
    creator: "warrayquipsome",
    primary_variables: [
        "--accent-color", 
        "--background-image", 
        "--glass-color", 
        "--text-normal"
    ],
    vibe: "Modern, transparent, minimalist, glassmorphism."
};

const server = serve({
    port: PORT,
    async fetch(req) {
        if (req.method !== "POST") return new Response("Use POST", { status: 405 });

        try {
            const { prompt, user, channel } = await req.json();

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "HTTP-Referer": "https://render.com",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "meta-llama/llama-3.1-8b-instruct:free",
                    messages: [
                        { 
                            role: "system", 
                            content: `You are the Official Chillax Support AI.
                            
                            KNOWLEDGE BASE:
                            1. Theme: Chillax (for Vencord and BetterDiscord).
                            2. FAQ/Guide: ${CHILLAX_CONTEXT.faq_url} (Always redirect here for installation or common bugs).
                            3. Creator: ${CHILLAX_CONTEXT.creator}.
                            4. Style: ${CHILLAX_CONTEXT.vibe}.

                            RULES:
                            - If a user asks for colors, provide a nice CSS variable snippet using RGB values.
                            - Example: If they ask for blue, suggest: --accent-color: rgb(0, 150, 255);
                            - Always mention that they can change these in their Vencord theme settings or the CSS file.
                            - If they are stuck on Vencord installation, tell them to visit the FAQ: ${CHILLAX_CONTEXT.faq_url}
                            - Keep the tone "Chill" but professional. Use Markdown code blocks for CSS.
                            - Mention that as a Vencord user, they can use the "Themes" tab for live editing.`
                        },
                        { role: "user", content: `User ${user} in channel ${channel} asks: ${prompt}` }
                    ],
                    temperature: 0.7 // Balanced between creative and factual
                }),
            });

            const data: any = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || "I'm lagging... try again later.";

            return new Response(JSON.stringify({ 
                reply: aiContent,
                status: "success" 
            }), {
                headers: { "Content-Type": "application/json" },
            });

        } catch (err) {
            return new Response(JSON.stringify({ reply: "Connection to the Chillax Matrix failed." }), { status: 500 });
        }
    },
});

console.log(`📡 Chillax AI Node active on port ${server.port}`);
