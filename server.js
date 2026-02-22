require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");

const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:5000',
  credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname)); // serve your HTML + CSS + assets

// 🔗 Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Connection Error:", err));

// ===== EXISTING USER SCHEMA =====
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["survivor", "firefly", "fedra"],
    required: true
  }
}, {
  timestamps: true
});

const User = mongoose.model("User", userSchema);

// ===== NEW ANALYTICS SCHEMAS =====

// 1. Infection History Schema
const infectionHistorySchema = new mongoose.Schema({
  sector: { type: String, required: true, index: true },
  date: { type: Date, required: true, default: Date.now },
  infectionRate: { type: Number, min: 0, max: 100, required: true },
  sampleSize: { type: Number, default: 10 },
  trend: { type: String, enum: ['rising', 'falling', 'stable'] }
}, {
  timestamps: true
});

infectionHistorySchema.index({ sector: 1, date: -1 });
const InfectionHistory = mongoose.model("InfectionHistory", infectionHistorySchema);

// 2. Resource Data Schema
const resourceDataSchema = new mongoose.Schema({
  sector: { type: String, required: true, unique: true, index: true },
  ammo: { type: Number, min: 0, max: 100, default: 25 },
  food: { type: Number, min: 0, max: 100, default: 25 },
  medical: { type: Number, min: 0, max: 100, default: 20 },
  tools: { type: Number, min: 0, max: 100, default: 15 },
  other: { type: Number, min: 0, max: 100, default: 15 },
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true
});

const ResourceData = mongoose.model("ResourceData", resourceDataSchema);

// 3. Sector Activity Schema
const sectorActivitySchema = new mongoose.Schema({
  sector: { type: String, required: true, unique: true, index: true },
  activeUsers: { type: Number, default: 0 },
  totalVisits: { type: Number, default: 0 },
  lastScan: { type: Date, default: Date.now },
  dangerLevel: { 
    type: String, 
    enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
    default: 'MODERATE'
  }
}, {
  timestamps: true
});

const SectorActivity = mongoose.model("SectorActivity", sectorActivitySchema);

// ===== EXISTING ENDPOINTS (UNCHANGED) =====

// ✅ Test endpoint
app.get("/api/test", (req, res) => {
  res.json({ 
    status: "Server is running", 
    time: new Date().toISOString(),
    endpoints: ["/register", "/login", "/api/debug/users"]
  });
});

// ✅ Debug endpoint to see all users
app.get("/api/debug/users", async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json({
      count: users.length,
      users: users
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Debug endpoint to check specific user
app.get("/api/debug/user/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }, { password: 0 });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Register API
app.post("/register", async (req, res) => {
  console.log("\n=== REGISTER REQUEST ===");
  console.log("Request body:", req.body);
  
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedRole = role.toLowerCase().trim();

    if (!["survivor", "firefly", "fedra"].includes(normalizedRole)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      username, 
      password: hashedPassword, 
      role: normalizedRole 
    });
    
    await user.save();

    res.json({ 
      success: true,
      user: { 
        id: user._id, 
        username: user.username, 
        role: user.role 
      } 
    });

  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ✅ Login API
app.post("/login", async (req, res) => {
  console.log("\n=== LOGIN REQUEST ===");
  console.log("Request body:", req.body);

  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password and role required" });
    }

    const normalizedRole = role.toLowerCase().trim();

    const user = await User.findOne({ 
      username: username,
      role: normalizedRole
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials or role" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ error: "Invalid credentials or role" });
    }

    res.json({ 
      success: true,
      user: { 
        id: user._id, 
        username: user.username, 
        role: user.role 
      } 
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ✅ Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// ✅ Clear all users (USE WITH CAUTION)
app.delete("/api/debug/clear-users", async (req, res) => {
  try {
    await User.deleteMany({});
    res.json({ message: "All users deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== REVISED ANALYTICS ENDPOINTS =====

// ✅ Get infection history for a sector (last 7 days)
app.get("/api/infection-history/:sector", async (req, res) => {
  try {
    const sector = req.params.sector;
    console.log(`Fetching infection history for: ${sector}`);
    
    const history = await InfectionHistory.find({ 
      sector: { $regex: new RegExp(sector, 'i') } // Case insensitive search
    })
      .sort({ date: -1 })
      .limit(7)
      .select('infectionRate date trend');
    
    console.log(`Found ${history.length} records`);
    res.json(history);
  } catch (err) {
    console.error("Error fetching infection history:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get resource data for a sector
app.get("/api/resource-data/:sector", async (req, res) => {
  try {
    const sector = req.params.sector;
    console.log(`Fetching resource data for: ${sector}`);
    
    const resource = await ResourceData.findOne({ 
      sector: { $regex: new RegExp(sector, 'i') }
    });
    
    const activity = await SectorActivity.findOne({ 
      sector: { $regex: new RegExp(sector, 'i') }
    });
    
    res.json({ 
      resource: resource || null, 
      activity: activity || null 
    });
  } catch (err) {
    console.error("Error fetching resource data:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADMIN: Add sample infection data (FIXED)
app.post("/api/admin/sample-infection", async (req, res) => {
  try {
    console.log("Adding sample infection data...");
    
    const sectors = [
      "NYC Ruins", "Pittsburgh QZ", "Boston QZ", "Jackson County",
      "FIREFLY HQ — Boston", "COMMAND — Boston QZ", "Atlanta Ruins",
      "Seattle Downtown", "Los Angeles Wasteland", "Washington DC Ruins",
      "Eugene Community", "SAFE POINT — Jackson", "Crater Lake",
      "Yellowstone Caldera", "Houston Refinery", "Miami Beach Ruins"
    ];
    
    const sampleData = [];
    const today = new Date();
    
    // Clear existing data first
    await InfectionHistory.deleteMany({});
    console.log("Cleared existing infection data");
    
    // Generate 7 days of data for each sector
    sectors.forEach(sector => {
      let baseRate;
      if (sector.includes("Ruins") || sector.includes("Wasteland") || sector.includes("Caldera")) {
        baseRate = 85;
      } else if (sector.includes("FIREFLY") || sector.includes("COMMAND")) {
        baseRate = 35;
      } else if (sector.includes("SAFE POINT") || sector.includes("Community")) {
        baseRate = 15;
      } else {
        baseRate = 55;
      }
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const randomVar = Math.floor(Math.random() * 20) - 10;
        let rate = baseRate + randomVar + (i * 1.5);
        rate = Math.min(100, Math.max(0, Math.round(rate)));
        
        let trend = 'stable';
        if (i > 0) {
          if (rate > baseRate + 2) trend = 'rising';
          else if (rate < baseRate - 2) trend = 'falling';
        }
        
        sampleData.push({
          sector,
          date,
          infectionRate: rate,
          sampleSize: Math.floor(Math.random() * 40) + 15,
          trend
        });
      }
    });
    
    const result = await InfectionHistory.insertMany(sampleData);
    console.log(`Added ${result.length} infection records`);
    
    res.json({ 
      success: true,
      message: "Sample infection data added", 
      count: result.length 
    });
  } catch (err) {
    console.error("Error adding sample infection data:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADMIN: Add sample resource data (FIXED)
app.post("/api/admin/sample-resources", async (req, res) => {
  try {
    console.log("Adding sample resource data...");
    
    const resourceSamples = [
      { 
        sector: "NYC Ruins", 
        ammo: 45, food: 10, medical: 15, tools: 20, other: 10,
        dangerLevel: "CRITICAL", activeUsers: 3, totalVisits: 150
      },
      { 
        sector: "Pittsburgh QZ", 
        ammo: 30, food: 25, medical: 20, tools: 15, other: 10,
        dangerLevel: "HIGH", activeUsers: 8, totalVisits: 220
      },
      { 
        sector: "Boston QZ", 
        ammo: 20, food: 35, medical: 25, tools: 10, other: 10,
        dangerLevel: "MODERATE", activeUsers: 25, totalVisits: 580
      },
      { 
        sector: "Jackson County", 
        ammo: 15, food: 45, medical: 20, tools: 10, other: 10,
        dangerLevel: "LOW", activeUsers: 42, totalVisits: 890
      },
      { 
        sector: "FIREFLY HQ — Boston", 
        ammo: 35, food: 15, medical: 30, tools: 15, other: 5,
        dangerLevel: "MODERATE", activeUsers: 18, totalVisits: 340
      },
      { 
        sector: "COMMAND — Boston QZ", 
        ammo: 40, food: 20, medical: 15, tools: 15, other: 10,
        dangerLevel: "MODERATE", activeUsers: 15, totalVisits: 280
      }
    ];
    
    // Clear existing data
    await ResourceData.deleteMany({});
    await SectorActivity.deleteMany({});
    console.log("Cleared existing resource data");
    
    // Insert resource data
    const resourceResult = await ResourceData.insertMany(resourceSamples);
    
    // Insert activity data
    const activityData = resourceSamples.map(r => ({
      sector: r.sector,
      activeUsers: r.activeUsers,
      totalVisits: r.totalVisits,
      lastScan: new Date(),
      dangerLevel: r.dangerLevel
    }));
    const activityResult = await SectorActivity.insertMany(activityData);
    
    console.log(`Added ${resourceResult.length} resource records`);
    console.log(`Added ${activityResult.length} activity records`);
    
    res.json({ 
      success: true,
      message: "Sample resource data added", 
      count: resourceResult.length 
    });
  } catch (err) {
    console.error("Error adding sample resource data:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ ADMIN: Clear all analytics data
app.delete("/api/admin/clear-analytics", async (req, res) => {
  try {
    await InfectionHistory.deleteMany({});
    await ResourceData.deleteMany({});
    await SectorActivity.deleteMany({});
    console.log("All analytics data cleared");
    res.json({ message: "All analytics data cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all sectors list (for dropdown)
app.get("/api/sectors", (req, res) => {
  const sectors = [
    "NYC Ruins", "Pittsburgh QZ", "Boston QZ", "Jackson County",
    "FIREFLY HQ — Boston", "COMMAND — Boston QZ", "Atlanta Ruins",
    "Seattle Downtown", "Los Angeles Wasteland", "Washington DC Ruins",
    "Eugene Community", "SAFE POINT — Jackson", "Crater Lake",
    "Yellowstone Caldera", "Houston Refinery", "Miami Beach Ruins",
    "Fargo Farmstead", "Green Bay Outpost", "Des Moines Silos", "Salem Outpost",
    "Burlington Commune", "Crater Lake", "Yosemite Valley", "Missoula Valley",
    "Boise Farmlands", "Asheville Outpost", "Nashville Soundstage",
    "Austin Community", "Santa Fe Pueblo", "Charlotte Settlement",
    "Blue Ridge Camp", "Carlsbad Caverns", "San Antonio Mission",
    "Bar Harbor Island", "Virginia Beach Camp", "Great Falls Station",
    "Thunder Bay Camp", "Quebec City Walls", "Palm Springs Oasis",
    "Flagstaff Heights", "Grand Junction Camp", "Rapid City Caverns",
    "Louisville Distillery", "Roanoke Colony"
  ];
  res.json(sectors);
});

// Serve the HTML
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found", path: req.path });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Global error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Add this for production port handling
const PORT = process.env.PORT || 5000;

// Add trust proxy for Render
app.set('trust proxy', 1);
app.listen(PORT, () => {
  console.log(`\n=== 🚀 SERVER STARTED ===`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔗 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  console.log(`\n📌 ENDPOINTS:`);
  console.log(`   • Main page: http://localhost:${PORT}/`);
  console.log(`   • Test: http://localhost:${PORT}/api/test`);
  console.log(`   • Health: http://localhost:${PORT}/api/health`);
  console.log(`   • Users: http://localhost:${PORT}/api/debug/users`);
  console.log(`\n📊 ANALYTICS:`);
  console.log(`   • Add sample infection: POST /api/admin/sample-infection`);
  console.log(`   • Add sample resources: POST /api/admin/sample-resources`);
  console.log(`   • Get infection history: GET /api/infection-history/:sector`);
  console.log(`   • Get resource data: GET /api/resource-data/:sector`);
  console.log(`   • Get sectors list: GET /api/sectors`);
  console.log(`========================\n`);
});