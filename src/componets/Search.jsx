import { useState, useEffect } from "react";

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
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error("Search failed:", err);
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
            <h1>Find Music to Rate</h1>
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