require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

// Use MONGODB_URI to match your Render Environment Variable name
const uri = process.env.MONGODB_URI;
const app = express();

// ===== MIDDLEWARE =====
app.use(cors({
  origin: '*', // Allows your frontend to work on the live Render URL
  credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname)); // Serves your HTML, CSS, and assets (bloater.webp, etc.)

// ===== 🔗 CONNECT TO MONGODB ATLAS =====
mongoose.connect(uri)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Connection Error:", err));

// ===== SCHEMAS =====

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["survivor", "firefly", "fedra"], required: true }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const infectionHistorySchema = new mongoose.Schema({
  sector: { type: String, required: true, index: true },
  date: { type: Date, required: true, default: Date.now },
  infectionRate: { type: Number, min: 0, max: 100, required: true },
  sampleSize: { type: Number, default: 10 },
  trend: { type: String, enum: ['rising', 'falling', 'stable'] }
}, { timestamps: true });

infectionHistorySchema.index({ sector: 1, date: -1 });
const InfectionHistory = mongoose.model("InfectionHistory", infectionHistorySchema);

const resourceDataSchema = new mongoose.Schema({
  sector: { type: String, required: true, unique: true, index: true },
  ammo: { type: Number, min: 0, max: 100, default: 25 },
  food: { type: Number, min: 0, max: 100, default: 25 },
  medical: { type: Number, min: 0, max: 100, default: 20 },
  tools: { type: Number, min: 0, max: 100, default: 15 },
  other: { type: Number, min: 0, max: 100, default: 15 },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

const ResourceData = mongoose.model("ResourceData", resourceDataSchema);

const sectorActivitySchema = new mongoose.Schema({
  sector: { type: String, required: true, unique: true, index: true },
  activeUsers: { type: Number, default: 0 },
  totalVisits: { type: Number, default: 0 },
  lastScan: { type: Date, default: Date.now },
  dangerLevel: { type: String, enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'], default: 'MODERATE' }
}, { timestamps: true });

const SectorActivity = mongoose.model("SectorActivity", sectorActivitySchema);

// ===== ENDPOINTS =====

app.get("/api/test", (req, res) => {
  res.json({
    status: "Server is running",
    time: new Date().toISOString(),
    endpoints: ["/register", "/login", "/api/debug/users"]
  });
});

app.get("/api/debug/users", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json({ count: users.length, users: users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// ✅ REGISTER API
app.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: "All fields required" });
    const normalizedRole = role.toLowerCase().trim();
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role: normalizedRole });
    await user.save();
    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) { res.status(500).json({ error: "Server error: " + err.message }); }
});

// ✅ LOGIN API
app.post("/login", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = await User.findOne({ username, role: role.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials or role" });
    }
    res.json({ success: true, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) { res.status(500).json({ error: "Server error: " + err.message }); }
});

// ===== ANALYTICS ENDPOINTS =====

app.get("/api/infection-history/:sector", async (req, res) => {
  try {
    const history = await InfectionHistory.find({ sector: { $regex: new RegExp(req.params.sector, 'i') } })
      .sort({ date: -1 }).limit(7);
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/resource-data/:sector", async (req, res) => {
  try {
    const sector = req.params.sector;
    const resource = await ResourceData.findOne({ sector: { $regex: new RegExp(sector, 'i') } });
    const activity = await SectorActivity.findOne({ sector: { $regex: new RegExp(sector, 'i') } });
    res.json({ resource: resource || null, activity: activity || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ✅ ADMIN: SEED DATA
app.post("/api/admin/sample-infection", async (req, res) => {
  try {
    const sectors = ["NYC Ruins", "Pittsburgh QZ", "Boston QZ", "Jackson County", "Atlanta Ruins", "Seattle Downtown"];
    await InfectionHistory.deleteMany({});
    const sampleData = [];
    const today = new Date();

    sectors.forEach(sector => {
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        sampleData.push({
          sector, date,
          infectionRate: Math.floor(Math.random() * 50) + 20,
          trend: 'stable'
        });
      }
    });
    const result = await InfectionHistory.insertMany(sampleData);
    res.json({ success: true, count: result.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/sample-resources", async (req, res) => {
  try {
    const resourceSamples = [
      { sector: "NYC Ruins", ammo: 45, food: 10, medical: 15, dangerLevel: "CRITICAL" },
      { sector: "Pittsburgh QZ", ammo: 30, food: 25, medical: 20, dangerLevel: "HIGH" },
      { sector: "Boston QZ", ammo: 20, food: 35, medical: 25, dangerLevel: "MODERATE" }
    ];
    await ResourceData.deleteMany({});
    await SectorActivity.deleteMany({});
    await ResourceData.insertMany(resourceSamples);
    const activityData = resourceSamples.map(r => ({ sector: r.sector, dangerLevel: r.dangerLevel }));
    await SectorActivity.insertMany(activityData);
    res.json({ success: true, message: "Resource data seeded" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sectors", (req, res) => {
  const sectors = [
    "NYC Ruins", "Pittsburgh QZ", "Boston QZ", "Jackson County",
    "FIREFLY HQ — Boston", "COMMAND — Boston QZ", "Atlanta Ruins",
    "Seattle Downtown", "Los Angeles Wasteland", "Washington DC Ruins",
    "Eugene Community", "SAFE POINT — Jackson", "Crater Lake",
    "Yellowstone Caldera", "Houston Refinery", "Miami Beach Ruins",
    "Fargo Farmstead", "Green Bay Outpost", "Des Moines Silos", "Salem Outpost"
    // ... add the rest of your 40+ sectors here
  ];
  res.json(sectors);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.set('trust proxy', 1);
app.listen(PORT, () => {
  console.log(`=== 🚀 SERVER STARTED ===\n📡 Port: ${PORT}`);
});