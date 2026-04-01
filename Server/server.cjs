require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8080;

// =======================
// 🗄️ DATABASE
// =======================

let db;

async function connectDB() {
  const client = new MongoClient(
    process.env.MONGO_URI || "mongodb://localhost:27017/",
  );
  await client.connect(); // let it throw — we'll catch at startup
  db = client.db("Playlist");
  console.log("Connected to MongoDB");
}

// Middleware to guard routes that need DB
function requireDB(req, res, next) {
  if (!db) return res.status(503).json({ message: "Database not ready" });
  next();
}

// =======================
// 🎵 SPOTIFY TOKEN
// =======================

let spotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  // Only fetch a new token if expired (with 60s buffer)
  if (spotifyToken && Date.now() < spotifyTokenExpiry - 60_000) return;

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
          ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  spotifyToken = response.data.access_token;
  spotifyTokenExpiry = Date.now() + response.data.expires_in * 1000;
}

// =======================
// 🎵 PLAYLIST ROUTES
// =======================

// GET all playlists
app.get("/playlists", requireDB, async (req, res) => {
  try {
    const playlists = await db.collection("Playlists").find().toArray();
    res.json(playlists);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching playlists" });
  }
});

// POST create a playlist
app.post("/playlists", requireDB, async (req, res) => {
  const { name, tracks = [] } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "Playlist name is required" });
  }

  try {
    const result = await db.collection("Playlists").insertOne({
      name: name.trim(),
      tracks,
      rating: null,
      createdAt: new Date(),
    });
    res.status(201).json({ _id: result.insertedId, name, tracks });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creating playlist" });
  }
});

// POST rate a playlist
app.post("/rate", requireDB, async (req, res) => {
  const { id, rating } = req.body;

  if (!id || !ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid playlist ID" });
  }
  if (typeof rating !== "number" || rating < 0 || rating > 5) {
    return res
      .status(400)
      .json({ message: "Rating must be a number between 0 and 5" });
  }

  try {
    const result = await db
      .collection("Playlists")
      .updateOne({ _id: new ObjectId(id) }, { $set: { rating } });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    const updated = await db.collection("Playlists").find().toArray();
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error updating rating" });
  }
});

// =======================
// 🎵 LAST.FM HELPER
// =======================

async function getLastFmBaseRating(artist, track) {
  try {
    const response = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: {
        method: "track.getInfo",
        api_key: process.env.LASTFM_API_KEY,
        artist,
        track,
        format: "json",
      },
    });

    const info = response.data.track;
    const listeners = parseInt(info?.listeners || "0");

    // Scale listeners to a 1–5 rating
    // 0–10k     → 1.0
    // 10k–100k  → 2.0
    // 100k–500k → 3.0
    // 500k–1M   → 4.0
    // 1M+       → 5.0
    let baseRating;
    if (listeners >= 1_000_000) baseRating = 5.0;
    else if (listeners >= 500_000) baseRating = 4.0;
    else if (listeners >= 100_000) baseRating = 3.0;
    else if (listeners >= 10_000) baseRating = 2.0;
    else baseRating = 1.0;

    return { baseRating, listeners };
  } catch (err) {
    console.error("Last.fm error:", err.message);
    return { baseRating: 2.5, listeners: 0 }; // safe fallback
  }
}

// =======================
// 🔍 SEARCH (Spotify + Last.fm)
// =======================

app.get("/search", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query)
    return res.status(400).json({ message: "Query parameter 'q' is required" });

  try {
    await getSpotifyToken();

    const searchResponse = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        params: { q: query, type: "track", limit: 10 },
        headers: { Authorization: `Bearer ${spotifyToken}` },
      },
    );

    const tracks = searchResponse.data.tracks.items;
    if (!tracks.length) return res.json([]);

    // Enrich each track with Last.fm data in parallel
    const results = await Promise.all(
      tracks.map(async (track) => {
        const artist = track.artists[0]?.name || "Unknown";
        const { baseRating, listeners } = await getLastFmBaseRating(
          artist,
          track.name,
        );

        return {
          id: track.id,
          name: track.name,
          artist,
          album: track.album?.name || "Unknown",
          albumArt: track.album?.images?.[1]?.url || null,
          listeners,
          baseRating,
          averageRating: baseRating, // starts as baseRating until users vote
        };
      }),
    );

    results.sort((a, b) => b.listeners - a.listeners);
    res.json(results);
  } catch (err) {
    console.error("Search error:", err.response?.data || err.message);
    res.status(502).json({ message: "Error fetching search results" });
  }
});

// =======================
// ⭐ TRACK RATING ROUTES
// =======================

// POST a user rating for a track
app.post("/tracks/rate", requireDB, async (req, res) => {
  const { trackId, trackName, artist, rating } = req.body;

  if (!trackId || !trackName || !artist) {
    return res
      .status(400)
      .json({ message: "trackId, trackName, and artist are required" });
  }
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return res
      .status(400)
      .json({ message: "Rating must be a number between 1 and 5" });
  }

  try {
    const collection = db.collection("TrackRatings");

    // Store individual rating
    await collection.insertOne({
      trackId,
      trackName,
      artist,
      rating,
      createdAt: new Date(),
    });

    // Recalculate average from all user ratings for this track
    const allRatings = await collection.find({ trackId }).toArray();
    const userAverage =
      allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    // Blend with Last.fm baseline (weighted: baseline counts as 3 votes)
    const { baseRating } = await getLastFmBaseRating(artist, trackName);
    const BASELINE_WEIGHT = 3;
    const blendedRating =
      (baseRating * BASELINE_WEIGHT + userAverage * allRatings.length) /
      (BASELINE_WEIGHT + allRatings.length);

    res.json({
      trackId,
      trackName,
      artist,
      baseRating,
      userRatingCount: allRatings.length,
      averageRating: parseFloat(blendedRating.toFixed(2)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error saving rating" });
  }
});

// GET ratings for a specific track
app.get("/tracks/:trackId/rating", requireDB, async (req, res) => {
  const { trackId } = req.params;

  try {
    const collection = db.collection("TrackRatings");
    const allRatings = await collection.find({ trackId }).toArray();

    if (!allRatings.length) {
      return res.json({ trackId, userRatingCount: 0, averageRating: null });
    }

    const userAverage =
      allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    res.json({
      trackId,
      userRatingCount: allRatings.length,
      averageRating: parseFloat(userAverage.toFixed(2)),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching ratings" });
  }
});

// GET global average rating for a playlist
app.get("/playlists/:id/globalavg", requireDB, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid playlist ID" });
  }

  try {
    const playlist = await db.collection("Playlists").findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!playlist)
      return res.status(404).json({ message: "Playlist not found" });
    if (!playlist.tracks?.length) return res.json({ globalAvg: null });

    const trackIds = playlist.tracks.map((t) => t.id);

    const ratings = await db
      .collection("TrackRatings")
      .find({ trackId: { $in: trackIds } })
      .toArray();

    if (!ratings.length) return res.json({ globalAvg: null });

    const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    res.json({ globalAvg: parseFloat(avg.toFixed(2)) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error calculating global average" });
  }
});

// =======================
// 🛠️ UTILITY ROUTES
// =======================

app.get("/", (req, res) => res.send("Server is running"));

app.get("/artists/:id", async (req, res) => {

    try{
        let collection = db.collection("Artists");
        let result = await collection.findOne({ArtistID: req.params.id});

        if(!result){
            res.status(404).json({ message: "Artist not found" });
            return;
        }
        res.json(result);
    }
    catch(e){
        console.log(e);
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/albums/:ArtistID", async (req,res) => {
    try{
        let collection = db.collection("Albums");
        let result = await collection.find({ ArtistID: req.params.ArtistID}).toArray();

        if(result.length === 0){
            res.status(404).json({message: "No albums found"});
            return;
        }
        res.json(result);
    }
    catch(e){
        console.log(e);
        res.status(500).json({ message: "Server error" });
    }
});


app.get("/allArtists", async (req, res) => {
    try{
        let collection = db.collection("Artists");
        let result = await collection.find().toArray();
        res.json(result);
    }
    catch(e){
        console.log(e);
    }
});

app.get("/allAlbums", async (req, res) => {
    try{
        let collection = db.collection("Albums");
        let result = await collection.find().toArray();
        res.json(result);
    }
    catch(e){
        console.log(e);
    }
});

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// =======================
// 🚀 START SERVER
// =======================

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
