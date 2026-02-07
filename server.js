const express = require('express');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.static('public'));

// 1. the player model (mongodb)
const UserSchema = new mongoose.Schema({
    discordId: String,
    essence: { type: Number, default: 500 },
    lastDaily: { type: Date, default: 0 },
    monsters: [{ 
        name: String, 
        element: String, 
        level: { type: Number, default: 1 },
        dna: Object 
    }]
});
const User = mongoose.model('User', UserSchema);

// 2. the dashboard route (the digital world)
app.get('/dash/:id', async (req, res) => {
    const user = await User.findOne({ discordId: req.params.id });
    if (!user) return res.send("user not found. spawn a monster in discord first!");
    res.render('dashboard', { user });
});

// 3. daily essence logic (website only)
app.post('/claim-daily', async (req, res) => {
    const user = await User.findOne({ discordId: req.body.id });
    const now = new Date();
    
    // check if 24 hours passed
    if (now - user.lastDaily < 86400000) {
        return res.json({ success: false, msg: "come back tomorrow!" });
    }
    
    user.essence += 200;
    user.lastDaily = now;
    await user.save();
    res.json({ success: true, newTotal: user.essence });
});

// 4. the /monster endpoint (from earlier)
app.post('/monster', async (req, res) => {
    // ... logic for spawning ...
});

mongoose.connect(process.env.MONGO_URI).then(() => {
    app.listen(process.env.PORT || 3000);
});
