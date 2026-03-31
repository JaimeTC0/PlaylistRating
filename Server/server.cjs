const express = require('express');
const app = express();

const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = 8080;

// MongoDB connection
let db;

async function connectDB() {
  const uri = "mongodb://localhost:27017/";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    db = client.db("Playlist");
    console.log("Connected to MongoDB");
  } catch (error) {
    console.log("DB connection error:", error);
  }
}

connectDB();


// =======================
// 🎵 PLAYLIST ROUTES
// =======================

// GET all playlists
app.get("/playlists", async (req, res) => {
  try {
    const collection = db.collection("Playlists");
    const playlists = await collection.find().toArray();
    res.json(playlists);
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Error fetching playlists" });
  }
});


// ⭐ RATE a playlist
app.post("/rate", async (req, res) => {
  const { id, rating } = req.body;

  try {
    const collection = db.collection("Playlists");

    await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { rating: rating } }
    );

    // return updated list
    const updated = await collection.find().toArray();
    res.json(updated);

  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Error updating rating" });
  }
});


// =======================
// 🧪 TEST ROUTES (optional)
// =======================

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get("/test", (req, res) => {
  res.send("API working");
});


// =======================
// 🚀 START SERVER
// =======================

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});