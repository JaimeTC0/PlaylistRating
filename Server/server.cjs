require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const { auth, adminOnly } = require("./middleware/auth.cjs");

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

function getRequesterObjectId(req) {
  const rawId = req.user?.id ? String(req.user.id) : "";
  return ObjectId.isValid(rawId) ? new ObjectId(rawId) : null;
}

function playlistAccessFilter(req, playlistId) {
  const base = { _id: new ObjectId(playlistId) };
  if (req.user?.role === "admin") return base;

  const requesterId = getRequesterObjectId(req);
  if (!requesterId) return null;
  return { ...base, ownerId: requesterId };
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

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");

async function seedDatabase() {
    try {
        const artistCount = await db.collection("Artists").countDocuments();
        const albumCount = await db.collection("Albums").countDocuments();

        //Add collections if they don't exist
        if (artistCount === 0) {
            console.log("Getting Artists collection...");
            const artists = await parseCSV(path.join(__dirname, "/Data/Artists.csv"));
                await db.collection("Artists").insertMany(artists);
                console.log(`Inserted ${artists.length} artists`);
        } 
        else {
            console.log("Artists already exists, skipping...");
        }

        if (albumCount === 0) {
            console.log("Getting Albums collection...");
            const albums = await parseCSV(path.join(__dirname, "/Data/Albums.csv"));
            await db.collection("Albums").insertMany(albums);
            console.log(`Inserted ${albums.length} albums`);
        } 
        else {
            console.log("Albums already exists, skipping...");
        }
    } catch (e) {
        console.error("Seeding error:", e);
    }
}

function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
            .on("data", (row) => results.push(row))
            .on("end", () => resolve(results))
            .on("error", (err) => reject(err));
    });
}

// =======================
// 🎵 PLAYLIST ROUTES
// =======================

// GET all playlists
app.get("/playlists", requireDB, auth, async (req, res) => {
  try {
    const requesterId = getRequesterObjectId(req);
    if (!requesterId && req.user?.role !== "admin") {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const query = req.user?.role === "admin" ? {} : { ownerId: requesterId };
    const playlists = await db.collection("Playlists").find(query).toArray();
    res.json(playlists);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching playlists" });
  }
});

// POST create a playlist
app.post("/playlists", requireDB, auth, async (req, res) => {
  const { name, tracks = [] } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ message: "Playlist name is required" });
  }

  try {
    const requesterId = getRequesterObjectId(req);
    if (!requesterId) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const result = await db.collection("Playlists").insertOne({
      name: name.trim(),
      tracks,
      rating: null,
      ownerId: requesterId,
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
app.delete("/playlists/:id", requireDB, auth, async (req, res) => {
  try {
    const playlistId = req.params.id;

    if (!ObjectId.isValid(playlistId)) {
      return res.status(400).json({ message: "Invalid playlist ID" });
    }

    const filter = playlistAccessFilter(req, playlistId);
    if (!filter) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const result = await db.collection("Playlists").deleteOne(filter);

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
app.put("/playlists/:id", requireDB, auth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { name } = req.body;

    if (!ObjectId.isValid(playlistId)) {
      return res.status(400).json({ message: "Invalid playlist ID" });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    const filter = playlistAccessFilter(req, playlistId);
    if (!filter) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const result = await db.collection("Playlists").updateOne(
      filter,
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
app.post("/playlists/:id/add-track", requireDB, auth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { track } = req.body;

    if (!ObjectId.isValid(playlistId)) {
      return res.status(400).json({ message: "Invalid playlist ID" });
    }

    const filter = playlistAccessFilter(req, playlistId);
    if (!filter) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const result = await db.collection("Playlists").updateOne(
      filter,
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
app.delete("/playlists/:id/remove-track", requireDB, auth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { trackId } = req.body;

    if (!ObjectId.isValid(playlistId)) {
      return res.status(400).json({ message: "Invalid playlist ID" });
    }

    if (!trackId) {
      return res.status(400).json({ message: "trackId is required" });
    }

    const filter = playlistAccessFilter(req, playlistId);
    if (!filter) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const result = await db.collection("Playlists").updateOne(
      filter,
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
          artistId: track.artists[0]?.id || null,
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
    if (err.response?.status === 429) {
      const retryAfter = err.response.headers?.["retry-after"] || 30;
      console.warn(`Rate limited. Retry after ${retryAfter}s`);
      return res.status(429).json({ message: `Rate limited. Try again in ${retryAfter} seconds.` });
    }
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
app.get("/playlists/:id/globalavg", requireDB, auth, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: "Invalid playlist ID" });
  }

  try {
    const filter = playlistAccessFilter(req, req.params.id);
    if (!filter) {
      return res.status(401).json({ message: "Invalid user identity" });
    }

    const playlist = await db.collection("Playlists").findOne(filter);

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


// Single Spotify Artist
app.get("/spotifyArtist/:id", async (req, res) => {
    try {
        await getSpotifyToken();
        const response = await axios.get(
            `https://api.spotify.com/v1/artists/${req.params.id}`,
            { headers: { Authorization: `Bearer ${spotifyToken}` } }
        );
        const artist = response.data;
        res.json({
            id: artist.id,
            name: artist.name,
            image: artist.images?.[0]?.url || null,
            genres: artist.genres,
            followers: artist.followers?.total || 0,
            popularity: artist.popularity,
        });
    } catch (err) {
        console.error("Spotify artist error:", err.response?.data || err.message);
        res.status(502).json({ message: "Error fetching artist" });
    }
});

// Artist Albums from Spotify
app.get("/spotifyAlbums/:id", async (req, res) => {
    try {
        await getSpotifyToken();
        const response = await axios.get(
            `https://api.spotify.com/v1/artists/${req.params.id}/albums`,
            {
                params: { limit: 10, include_groups: "album" },
                headers: {Authorization: `Bearer ${spotifyToken}` }
            }
        );
        const albums = response.data.items.map(album => ({
            id: album.id,
            AlbumName: album.name,
            Year: album.release_date?.split("-")[0],
            image: album.images?.[1]?.url || null,
        }));
        res.json(albums);
    } catch (err) {
        console.error("Spotify albums error:", err.response?.data || err.message);
        res.status(502).json({ message: "Error fetching albums" });
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
// 👑 ADMIN ROUTES
// =======================

app.get("/admin/users", requireDB, auth, adminOnly, async (req, res) => {
  try {
    const users = await db
      .collection("Users")
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(users);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.post("/admin/users", requireDB, auth, adminOnly, async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email, and password are required" });
    }

    const normalizedRole = role === "admin" ? "admin" : "user";
    const usersCollection = db.collection("Users");

    const existing = await usersCollection.findOne({
      $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }],
    });

    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await usersCollection.insertOne({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: normalizedRole,
      createdAt: new Date(),
    });

    const created = await usersCollection.findOne(
      { _id: result.insertedId },
      { projection: { password: 0 } },
    );

    res.status(201).json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creating user" });
  }
});

app.put("/admin/users/:id", requireDB, auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, role, password } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const updates = {};
    if (username && username.trim()) updates.username = username.trim();
    if (email && email.trim()) updates.email = email.trim().toLowerCase();
    if (role) updates.role = role === "admin" ? "admin" : "user";
    if (password && password.trim()) {
      updates.password = await bcrypt.hash(password.trim(), 10);
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No valid fields provided" });
    }

    const result = await db
      .collection("Users")
      .updateOne({ _id: new ObjectId(id) }, { $set: updates });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const updated = await db
      .collection("Users")
      .findOne({ _id: new ObjectId(id) }, { projection: { password: 0 } });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error updating user" });
  }
});

app.delete("/admin/users/:id", requireDB, auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const result = await db.collection("Users").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "User deleted" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error deleting user" });
  }
});

// =======================
// 🚀 START SERVER
// =======================

connectDB()
  .then(async () => {
    await seedDatabase();

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
