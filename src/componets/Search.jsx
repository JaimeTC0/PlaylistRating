import { useState, useEffect, useRef } from "react";
 
const WORDS = [
  { text: "rate",     color: "#D85A30" },
  { text: "vibe",   color: "#7F77DD" },
  { text: "love",     color: "#D4537E" },
  { text: "discover", color: "#1D9E75" },
  { text: "listen",    color: "#378ADD" },
];
 
function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("in"); // "in" | "out"
  const [chars, setChars] = useState([]);
 
  useEffect(() => {
    setChars(Array.from(WORDS[index].text));
    setPhase("in");
  }, [index]);
 
  useEffect(() => {
    if (phase !== "in") return;
    const timer = setTimeout(() => setPhase("out"), 2000);
    return () => clearTimeout(timer);
  }, [phase, index]);
 
  useEffect(() => {
    if (phase !== "out") return;
    const duration = chars.length * 32 + 280;
    const timer = setTimeout(() => {
      setIndex(i => (i + 1) % WORDS.length);
    }, duration);
    return () => clearTimeout(timer);
  }, [phase, chars.length]);
 
  const word = WORDS[index];
 
  return (
    <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom" }}>
      {chars.map((ch, i) => {
        const isOut = phase === "out";
        const delay = isOut
          ? (chars.length - 1 - i) * 32
          : i * 38;
        return (
          <span
            key={`${index}-${i}`}
            style={{
              display: "inline-block",
              color: word.color,
              opacity: phase === "in" ? 1 : 0,
              transform: phase === "in" ? "translateY(0)" : "translateY(-80%)",
              transition: `opacity 0.22s ${delay}ms, transform 0.28s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
            }}
          >
            {ch}
          </span>
        );
      })}
    </span>
  );
}

function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userPlaylists, setUserPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");

  useEffect(() => {
  fetch("http://localhost:8080/playlists")
    .then((res) => res.json())
    .then((data) => {
      setUserPlaylists(data);
    })
    .catch((err) => console.error("Error loading playlists:", err));
}, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } else {
        console.error("Search failed with status:", res.status);
        setResults([]);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (track) => {
    if (!selectedPlaylistId) {
      alert("Please create or select a playlist first!");
      return;
    }

    try {
      const res = await fetch(`http://localhost:8080/playlists/${selectedPlaylistId}/add-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          track: {
            id: track.id,
            title: track.name,
            artist: track.artist,
            albumArt: track.albumArt
          }
        })
      });
      
      if (res.ok) alert(`Added ${track.name} to playlist!`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="search-page">
        <div className="search-container">
            <h1>Find Music to <RotatingWord /></h1>
            <form onSubmit={handleSearch} className="search-form">
            <input
                type="text"
                placeholder="Search for a song or artist..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" disabled={loading}>
                {loading ? "Searching..." : "Search"}
            </button>
            </form>
        </div>

        <div className="search-results-grid">
            {results.map((track) => (
                <div key={track.id} className="track-card">
                    <div className="track-art-wrapper">
                        <img 
                        src={track.albumArt || "default-placeholder.png"} 
                        alt={track.album} 
                        className="track-art"
                        />
                    </div>
                    
                    <div className="track-info">
                        <h3 className="track-name">{track.name}</h3>
                        <p className="track-artist">{track.artist}</p>
                        <p className="track-album">{track.album}</p>
                    </div>

                    <div className="track-actions">
                        <div className="track-stats">
                            <span className="listeners-count">
                            {track.listeners?.toLocaleString() || 0} listeners
                            </span>
                            <span className="track-rating">{track.baseRating} ★</span>
                        </div>
                        
                        <div className="add-controls">
                            <select 
                            className="add-select"
                            value={selectedPlaylistId}
                            onChange={(e) => setSelectedPlaylistId(e.target.value)}
                            >
                            <option value="">Select Playlist...</option>
                            {userPlaylists.map(p => (
                                <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                            </select>

                            {/* The explicit action button */}
                            <button 
                            className="add-btn"
                            onClick={() => handleAdd(track)}
                            title="Add to selected playlist"
                            >
                            +
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
}

export default Search;