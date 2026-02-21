require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve your HTML + CSS + assets

// 🔗 Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// 👤 User Schema with role
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["survivor", "firefly", "FEDRA"], 
    required: true 
  }
});

const User = mongoose.model("User", userSchema);

// ✅ Register API
app.post("/register", async (req, res) => {
  console.log("Register request body:", req.body);
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (!["survivor", "firefly", "FEDRA"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();

    res.json({ user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ Login API
app.post("/login", async (req, res) => {
  console.log("Login request body:", req.body);
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password and role required" });
    }

    const user = await User.findOne({ username, role });
    if (!user) return res.status(400).json({ error: "Invalid credentials or role" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials or role" });

    res.json({ user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Serve the HTML
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/registration.html");
});

app.listen(5000, () => console.log("Server running on port 5000"));
