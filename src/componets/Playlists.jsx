import { useEffect, useState } from "react";
import "./Playlists.css";
import { optimisticUpdate } from "../ratingUtils";

// =======================
// PLAYLIST LIST VIEW
// =======================
function PlaylistList({ onOpen }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [ascending, setAscending] = useState(true);

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      const res = await fetch("http://localhost:8080/playlists");
      const data = await res.json();
      const enriched = await Promise.all(
        data.map(async (p) => {
          try {
            const r = await fetch(
              `http://localhost:8080/playlists/${p._id}/globalavg`,
            );
            const { globalAvg } = await r.json();
            return { ...p, globalAvg };
          } catch {
            return { ...p, globalAvg: null };
          }
        }),
      );
      setPlaylists(enriched);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = (newPlaylist) => {
    setPlaylists((prev) => [...prev, { ...newPlaylist, globalAvg: null }]);
    setShowModal(false);
    showToast("Playlist created!");
  };

  const toggleSort = (field) => {
    if (sortBy === field) setAscending(!ascending);
    else {
      setSortBy(field);
      setAscending(true);
    }
  };

  const sorted = [...playlists].sort((a, b) => {
    let comp = 0;
    if (sortBy === "name") comp = (a.name || "").localeCompare(b.name || "");
    else if (sortBy === "user") comp = (a.rating ?? 0) - (b.rating ?? 0);
    else if (sortBy === "global")
      comp = (a.globalAvg ?? 0) - (b.globalAvg ?? 0);
    return ascending ? comp : -comp;
  });

  const handleDelete = async (playlistId, playlistName) => {
    if (!window.confirm(`Are you sure you want to delete "${playlistName}"?`))
      return;

    try {
      const res = await fetch(`http://localhost:8080/playlists/${playlistId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Server Error:", errorData.message);
        throw new Error(errorData.message || "Delete failed");
      }

      setPlaylists((prev) => prev.filter((p) => p._id !== playlistId));
      showToast(`Deleted "${playlistName}"`);
    } catch (err) {
      console.error("Delete Click Error:", err);
      showToast("Failed to delete playlist");
    }
  };

  return (
    <div className="pl-page">
      <div className="pl-header">
        <div>
          <h1 className="pl-title">
            YOUR
            <br />
            <span className="pl-accent">PLAYLISTS</span>
          </h1>
          <div className="pl-divider" />
          <p className="pl-sub">Click a playlist to explore · Sort by column</p>
        </div>
        <button className="pl-new-btn" onClick={() => setShowModal(true)}>
          + NEW PLAYLIST
        </button>
      </div>

      {!loading && playlists.length > 0 && (
        <div className="pl-table-header">
          <div
            className="pl-col pl-col-name"
            onClick={() => toggleSort("name")}
          >
            Name {sortBy === "name" && (ascending ? "▲" : "▼")}
          </div>
          <div className="pl-col pl-col-tracks">Tracks</div>
          <div
            className="pl-col pl-col-user"
            onClick={() => toggleSort("user")}
          >
            Your Rating {sortBy === "user" && (ascending ? "▲" : "▼")}
          </div>
          <div
            className="pl-col pl-col-global"
            onClick={() => toggleSort("global")}
          >
            Global Avg {sortBy === "global" && (ascending ? "▲" : "▼")}
          </div>
        </div>
      )}

      {loading ? (
        <div className="pl-loading">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="pl-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty-icon">♫</div>
          <p className="pl-empty-text">No playlists yet — create one!</p>
        </div>
      ) : (
        <div className="pl-grid">
          {sorted.map((p, i) => (
            <div
              key={p._id}
              className="pl-row"
              style={{ animationDelay: `${i * 0.05}s` }}
              onClick={() => onOpen(p)}
            >
              <div className="pl-col pl-col-name pl-row-name">
                <span className="pl-name-text">{p.name || "Untitled"}</span>
                <button
                  className="pl-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(p._id, p.name || "Untitled");
                  }}
                >
                  🗑️
                </button>
              </div>
              <div className="pl-col pl-col-tracks pl-muted">
                {p.tracks?.length ?? 0} songs
              </div>
              <div className="pl-col pl-col-user">
                {p.rating != null ? (
                  <span className="pl-rating-num">
                    {p.rating}
                    <span className="pl-rating-denom">/5</span>
                  </span>
                ) : (
                  <span className="pl-muted">—</span>
                )}
              </div>
              <div className="pl-col pl-col-global">
                {p.globalAvg != null ? (
                  <span className="pl-global-num">{p.globalAvg}</span>
                ) : (
                  <span className="pl-muted">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          nextNumber={playlists.length + 1} // Add this line
        />
      )}

      <div className={`pl-toast${toastVisible ? " show" : ""}`}>{toast}</div>
    </div>
  );
}

// =======================
// CREATE MODAL
// =======================
function CreateModal({ onClose, onCreate, nextNumber }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setSaving(true);
    const genericName = `Playlist ${nextNumber}`; // Generates "Playlist 3", etc.

    try {
      const res = await fetch("http://localhost:8080/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: genericName,
          tracks: [], // Creates it empty as requested
        }),
      });

      if (!res.ok) throw new Error();

      const created = await res.json();
      onCreate(created);
    } catch {
      setError("Failed to create playlist. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pl-modal-overlay" onClick={onClose}>
      <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pl-modal-header">
          <h2 className="pl-modal-title">CONFIRM NEW PLAYLIST</h2>
          <button className="pl-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="pl-modal-body">
          <p className="pl-sub">
            This will create a new empty playlist named{" "}
            <strong>Playlist {nextNumber}</strong>. You can add songs to it
            later from the Search page.
          </p>
          {error && <p className="pl-error">{error}</p>}
        </div>

        <div className="pl-modal-footer">
          <button className="pl-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="pl-create-btn"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Creating..." : "Confirm & Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =======================
// PLAYLIST DETAIL VIEW
// =======================
function PlaylistDetail({ playlist, onBack }) {
  const [tracks, setTracks] = useState(playlist.tracks || []);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  useEffect(() => {
    async function enrichTracks() {
      const enriched = await Promise.all(
        (playlist.tracks || []).map(async (t) => {
          try {
            const res = await fetch(
              `http://localhost:8080/tracks/${t.id}/rating`,
            );
            const data = await res.json();
            return {
              ...t,
              globalAvg: data.averageRating,
              userRatingCount: data.userRatingCount,
            };
          } catch {
            return { ...t, globalAvg: null, userRatingCount: 0 };
          }
        }),
      );
      setTracks(enriched);
    }
    enrichTracks();
  }, [playlist]);

  const handleRate = async (trackId, rating) => {
    setSaving(trackId);

    // Optimistic update
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          userRating: rating,
          globalAvg: optimisticUpdate(
            t.globalAvg ?? rating,
            t.userRatingCount ?? 0,
            rating,
          ),
        };
      }),
    );

    try {
      const track = tracks.find((t) => t.id === trackId);
      const res = await fetch("http://localhost:8080/tracks/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          trackName: track?.title || track?.name || "",
          artist: track?.artist || "",
          rating,
        }),
      });
      const data = await res.json();
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId
            ? {
                ...t,
                userRating: rating,
                globalAvg: data.averageRating,
                userRatingCount: data.userRatingCount,
              }
            : t,
        ),
      );
      showToast(`Rated ${rating}★`);
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="pl-page">
      <div className="pl-detail-header">
        <button className="pl-back-btn" onClick={onBack}>
          ← BACK
        </button>
        <div>
          <h1 className="pl-title">{playlist.name || "Untitled"}</h1>
          <div className="pl-divider" />
          <p className="pl-sub">
            {tracks.length} song{tracks.length !== 1 ? "s" : ""} · Rate each
            track
          </p>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="pl-empty">
          <div className="pl-empty-icon">♪</div>
          <p className="pl-empty-text">No songs in this playlist</p>
        </div>
      ) : (
        <div className="pl-grid">
          {tracks.map((t, i) => (
            <div
              key={t.id || i}
              className="pl-track-card"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="pl-track-info">
                <div className="pl-track-title">
                  {t.title || t.name || "Unknown"}
                </div>
                <div className="pl-track-artist">
                  {t.artist || "Unknown Artist"}
                </div>
                <div className="pl-track-stats">
                  <span className="pl-stat">
                    <span className="pl-stat-label">GLOBAL</span>
                    <span className="pl-stat-value">
                      {t.globalAvg != null ? t.globalAvg : "—"}
                    </span>
                  </span>
                  <span className="pl-stat-divider" />
                  <span className="pl-stat">
                    <span className="pl-stat-label">YOUR RATING</span>
                    <span className="pl-stat-value pl-accent-text">
                      {t.userRating != null ? t.userRating : "—"}
                    </span>
                  </span>
                </div>
              </div>
              <div className="pl-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleRate(t.id, n)}
                    disabled={saving === t.id}
                    className={[
                      "pl-star-btn",
                      t.userRating === n ? "active" : "",
                      saving === t.id ? "saving" : "",
                    ]
                      .join(" ")
                      .trim()}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`pl-toast${toastVisible ? " show" : ""}`}>{toast}</div>
    </div>
  );
}

// =======================
// ROOT EXPORT
// =======================
export default function Playlists() {
  const [openPlaylist, setOpenPlaylist] = useState(null);

  if (openPlaylist) {
    return (
      <PlaylistDetail
        playlist={openPlaylist}
        onBack={() => setOpenPlaylist(null)}
      />
    );
  }
  return <PlaylistList onOpen={setOpenPlaylist} />;
}
