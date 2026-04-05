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
let popularCache = {
  data: null,
  expiresAt: 0,
  pending: null,
};

const POPULAR_CACHE_TTL_MS = 10 * 60 * 1000;
const SPOTIFY_REQUEST_DELAY_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSpotifyToken() {
  // Only fetch a new token if expired (with 60s buffer)
  if (spotifyToken && Date.now() < spotifyTokenExpiry - 60_000) return;

  console.log("Fetching new Spotify token...");
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
  console.log("Spotify token response status:", response.status);

  spotifyToken = response.data.access_token;
  spotifyTokenExpiry = Date.now() + response.data.expires_in * 1000;
  console.log("Token obtained successfully");
}

async function getPopularTracks() {
  if (popularCache.data && Date.now() < popularCache.expiresAt) {
    console.log("Returning cached popular tracks");
    return popularCache.data;
  }

  if (popularCache.pending) {
    console.log("Waiting for in-flight popular tracks request");
    return popularCache.pending;
  }

  popularCache.pending = (async () => {
    console.log("Fetching popular tracks from Last.fm and Spotify...");

    await getSpotifyToken();

    const response = await axios.get("https://ws.audioscrobbler.com/2.0/", {
      params: {
        method: "chart.getTopTracks",
        api_key: process.env.LASTFM_API_KEY,
        format: "json",
        limit: 10,
      },
    });

    const tracks = response.data.tracks.track;
    if (!tracks.length) return [];

    const results = [];
    let spotifyDisabledUntil = 0;

    for (const track of tracks) {
      const artist = track.artist.name;
      const name = track.name;
      const listeners = parseInt(track.listeners);

      if (Date.now() < spotifyDisabledUntil) {
        results.push({
          id: `lastfm-${name}-${artist}`,
          name,
          artist,
          album: "Unknown",
          albumArt: null,
          listeners,
          baseRating: 5.0,
          averageRating: 5.0,
        });
        continue;
      }

      try {
        const searchResponse = await axios.get(
          "https://api.spotify.com/v1/search",
          {
            params: { q: `${name} ${artist}`, type: "track", limit: 1 },
            headers: { Authorization: `Bearer ${spotifyToken}` },
          },
        );

        const spotifyTrack = searchResponse.data.tracks?.items?.[0];
        results.push({
          id: spotifyTrack?.id || `lastfm-${name}-${artist}`,
          name: spotifyTrack?.name || name,
          artist: spotifyTrack?.artists?.[0]?.name || artist,
          album: spotifyTrack?.album?.name || "Unknown",
          albumArt: spotifyTrack?.album?.images?.[1]?.url || null,
          listeners,
          baseRating: 5.0,
          averageRating: 5.0,
        });
      } catch (err) {
        const status = err.response?.status;
        console.error("Spotify search failed for", name, artist, err.message);

        if (status === 429) {
          const retryAfterSeconds = Number(err.response?.headers?.["retry-after"] || 60);
          const cooldownSeconds = Math.min(Math.max(retryAfterSeconds, 60), 300);
          spotifyDisabledUntil = Date.now() + cooldownSeconds * 1000;
          console.warn(`Spotify rate limited. Falling back to Last.fm-only results for ${cooldownSeconds}s.`);
        }

        results.push({
          id: `lastfm-${name}-${artist}`,
          name,
          artist,
          album: "Unknown",
          albumArt: null,
          listeners,
          baseRating: 5.0,
          averageRating: 5.0,
        });
      }

      await sleep(SPOTIFY_REQUEST_DELAY_MS);
    }

    results.sort((a, b) => b.listeners - a.listeners);
    popularCache.data = results;
    popularCache.expiresAt = Date.now() + POPULAR_CACHE_TTL_MS;
    return results;
  })();

  try {
    return await popularCache.pending;
  } finally {
    popularCache.pending = null;
  }
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

// DELETE a playlist by ID
app.delete("/playlists/:id", requireDB, async (req, res) => {
  try {
    const playlistId = req.params.id;

    const result = await db.collection("Playlists").deleteOne({
      _id: new ObjectId(playlistId),
    });

    if (result.deletedCount === 1) {
      console.log("Successfully deleted from 'Playlists' collection");
      res.json({ message: "Playlist deleted!" });
    } else {
      res.status(404).json({ message: "Playlist not found in 'Playlists' collection" });
    }
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// UPDATE playlist name
app.put("/playlists/:id", requireDB, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const result = await db.collection("Playlists").updateOne(
      { _id: new ObjectId(playlistId) },
      { $set: { name: name.trim() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    res.json({ message: "Playlist updated successfully" });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADD a song to a playlist
app.post("/playlists/:id/add-track", requireDB, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { track } = req.body;

    // Use "Playlists" (plural) to match your working GET/POST routes
    const result = await db.collection("Playlists").updateOne(
      { _id: new ObjectId(playlistId) },
      { $push: { tracks: track } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    res.json({ message: "Track added successfully!" });
  } catch (err) {
    console.error("ADD TRACK ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// REMOVE a song from a playlist
app.delete("/playlists/:id/remove-track", requireDB, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { trackId } = req.body;

    if (!trackId) {
      return res.status(400).json({ message: "trackId is required" });
    }

    const result = await db.collection("Playlists").updateOne(
      { _id: new ObjectId(playlistId) },
      { $pull: { tracks: { id: trackId } } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    res.json({ message: "Track removed successfully!" });
  } catch (err) {
    console.error("REMOVE TRACK ERROR:", err);
    res.status(500).json({ message: "Internal server error" });
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
    console.log("Fetching Spotify token...");
    await getSpotifyToken();
    console.log("Token fetched successfully");

    console.log("Searching Spotify for:", query);
    const searchResponse = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        params: { q: query, type: "track", limit: 10 },
        headers: { Authorization: `Bearer ${spotifyToken}` },
      },
    );
    console.log("Spotify search response status:", searchResponse.status);

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
// 🎵 POPULAR TRACKS
// =======================

app.get("/popular", async (req, res) => {
  console.log("Fetching popular tracks...");
  try {
    const results = await getPopularTracks();
    res.json(results);
  } catch (err) {
    console.error("Popular error:", err.message);
    res.status(502).json({ message: "Error fetching popular tracks" });
  }
});

// =======================
// ⭐ TRACK RATING ROUTES
// =======================

// POST a user rating for a track
app.post("/tracks/rate", requireDB, async (req, res) => {
  const { trackId, trackName, artist, rating, userId } = req.body;

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

    // Use upsert to replace if user already rated this track, or insert if new
    const userIdentifier = userId || "anonymous";
    await collection.updateOne(
      { trackId, userId: userIdentifier },
      {
        $set: {
          trackId,
          userId: userIdentifier,
          trackName,
          artist,
          rating,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Recalculate average from all unique user ratings for this track
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

// GET user's rating for a specific track
app.get("/tracks/:trackId/user-rating", requireDB, async (req, res) => {
  const { trackId } = req.params;
  const { userId } = req.query;

  try {
    const collection = db.collection("TrackRatings");
    const userRating = await collection.findOne({ trackId, userId: userId || "anonymous" });

    res.json({
      trackId,
      userRating: userRating?.rating || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching user rating" });
  }
});

// GET ratings for a specific track
app.get("/tracks/:trackId/rating", requireDB, async (req, res) => {
  const { trackId } = req.params;
  const { artist, trackName } = req.query;

  try {
    const collection = db.collection("TrackRatings");
    const allRatings = await collection.find({ trackId }).toArray();

    let baseRating = 2.5; // default fallback

    if (allRatings.length) {
      // Get artist and track name from the first rating to fetch baseline
      const firstRating = allRatings[0];
      const result = await getLastFmBaseRating(firstRating.artist, firstRating.trackName);
      baseRating = result.baseRating;

      const userAverage =
        allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

      // Blend with baseline (baseline counts as 3 votes)
      const BASELINE_WEIGHT = 3;
      const blendedRating =
        (baseRating * BASELINE_WEIGHT + userAverage * allRatings.length) /
        (BASELINE_WEIGHT + allRatings.length);

      return res.json({
        trackId,
        userRatingCount: allRatings.length,
        averageRating: parseFloat(blendedRating.toFixed(2)),
      });
    }

    // No user ratings yet - fetch baseline if artist/trackName provided
    if (artist && trackName) {
      const result = await getLastFmBaseRating(artist, trackName);
      baseRating = result.baseRating;
    }

    res.json({
      trackId,
      userRatingCount: 0,
      averageRating: baseRating,
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

  try {
    let collection = db.collection("Artists");
    let result = await collection.findOne({ ArtistID: req.params.id });

    if (!result) {
      res.status(404).json({ message: "Artist not found" });
      return;
    }
    res.json(result);
  }
  catch (e) {
    console.log(e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/albums/:ArtistID", async (req, res) => {
  try {
    let collection = db.collection("Albums");
    let result = await collection.find({ ArtistID: req.params.ArtistID }).toArray();

    if (result.length === 0) {
      res.status(404).json({ message: "No albums found" });
      return;
    }
    res.json(result);
  }
  catch (e) {
    console.log(e);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/allArtists", async (req, res) => {
  try {
    let collection = db.collection("Artists");
    let result = await collection.find().toArray();
    res.json(result);
  }
  catch (e) {
    console.log(e);
  }
});

app.get("/allAlbums", async (req, res) => {
  try {
    let collection = db.collection("Albums");
    let result = await collection.find().toArray();
    res.json(result);
  }
  catch (e) {
    console.log(e);
  }
});

// =======================
// 🚀 START SERVER
// =======================

connectDB()
  .then(() => {
    // Set db for auth routes
    const { setDb } = require("./routes/auth.cjs");
    const authRouter = require("./routes/auth.cjs");
    setDb(db);

    // =======================
    // 🔐 AUTH ROUTES
    // =======================
    app.use("/api/auth", authRouter);

    // Catch-all 404 handler (must be registered last)
    app.use((req, res) => res.status(404).json({ message: "Route not found" }));

    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`),
    );
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
