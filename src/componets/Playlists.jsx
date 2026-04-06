import { useEffect, useState } from "react";
import "./Playlists.css";
import { optimisticUpdate } from "../ratingUtils";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: localStorage.getItem("token") || "",
});

// =======================
// ROTATING MUSIC EMOJIS
// =======================
function RotatingEmojis() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState("in"); // "in" | "out"
  const [currentEmojis, setCurrentEmojis] = useState([]);

  const EMOJIS = ["🎵", "🎶", "🎼", "🎧", "🎤", "🎷", "🎸", "🥁", "🎹", "🎺", "🎻", "⏯️", "🔊", "💿", "🔥"];

  useEffect(() => {
    const startIdx = index * 5;
    const endIdx = Math.min(startIdx + 5, EMOJIS.length);
    setCurrentEmojis(EMOJIS.slice(startIdx, endIdx));
    setPhase("in");
  }, [index]);

  useEffect(() => {
    if (phase !== "in") return;
    const timer = setTimeout(() => setPhase("out"), 2000);
    return () => clearTimeout(timer);
  }, [phase, index]);

  useEffect(() => {
    if (phase !== "out") return;
    const duration = currentEmojis.length * 60 + 500;
    const timer = setTimeout(() => {
      setIndex(i => (i + 1) % Math.ceil(EMOJIS.length / 5));
    }, duration);
    return () => clearTimeout(timer);
  }, [phase, currentEmojis.length]);

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", gap: "20px" }}>
      {currentEmojis.map((emoji, i) => {
        const isOut = phase === "out";
        const delay = isOut
          ? (currentEmojis.length - 1 - i) * 60
          : i * 80;
        return (
          <span
            key={`${index}-${i}`}
            style={{
              display: "inline-block",
              fontSize: "56px",
              opacity: phase === "in" ? 1 : 0,
              transform: phase === "in" ? "translateY(0)" : "translateY(-20px)",
              transition: `opacity 0.3s ${delay}ms, transform 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
            }}
          >
            {emoji}
          </span>
        );
      })}
    </div>
  );
}

// =======================
// PLAYLIST LIST VIEW
// =======================
function PlaylistList({ onOpen, setPage, isAdmin }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [sortBy, setSortBy] = useState("name");
  const [ascending, setAscending] = useState(true);

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const askConfirm = (title, message, onConfirm, confirmLabel = "Delete") => {
    setConfirmDialog({ title, message, onConfirm, confirmLabel });
  };

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      const token = localStorage.getItem("token") || "";
      const res = await fetch("http://localhost:8080/playlists", {
        headers: { Authorization: token },
      });
      const data = await res.json();
      const enriched = await Promise.all(
        data.map(async (p) => {
          try {
            const r = await fetch(
              `http://localhost:8080/playlists/${p._id}/globalavg`,
              {
                headers: { Authorization: token },
              }
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
    askConfirm(
      "Delete Playlist",
      `Are you sure you want to delete "${playlistName}"? This cannot be undone.`,
      async () => {
        try {
          const res = await fetch(`http://localhost:8080/playlists/${playlistId}`, {
            method: "DELETE",
            headers: {
              Authorization: localStorage.getItem("token") || "",
            },
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
        } finally {
          setConfirmDialog(null);
        }
      }
    );
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
        <div style={{ position: "absolute", left: "450px", top: "120px", width: "100%", pointerEvents: "none" }}>
          <RotatingEmojis />
        </div>
        {isAdmin && (
          <button className="pl-new-btn" onClick={() => setShowModal(true)}>
            + NEW PLAYLIST
          </button>
        )}
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
                  className="pl-add-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log("Going to search page");
                    setPage("search");
                  }}
                >
                  ➕
                </button>
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

      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
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
  const [name, setName] = useState(`Playlist ${nextNumber}`);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Please enter a playlist name.");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("http://localhost:8080/playlists", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: name.trim(),
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
            Enter a name for your new playlist. You can add songs to it
            later from the Search page.
          </p>
          <input
            type="text"
            className="pl-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            maxLength={50}
          />
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

function ConfirmModal({ title, message, confirmLabel = "Delete", onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pl-modal-overlay" onClick={onCancel}>
      <div className="pl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pl-modal-header">
          <h2 className="pl-modal-title">{title}</h2>
          <button className="pl-modal-close" onClick={onCancel}>✕</button>
        </div>

        <div className="pl-modal-body">
          <p className="pl-sub" style={{ marginTop: 0, textTransform: "none", letterSpacing: "0.4px" }}>
            {message}
          </p>
        </div>

        <div className="pl-modal-footer">
          <button className="pl-cancel-btn" onClick={onCancel}>Cancel</button>
          <button className="pl-danger-btn" onClick={handleConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// =======================
// PLAYLIST DETAIL VIEW
// =======================
function PlaylistDetail({ playlist, onBack, isAdmin }) {
  const [tracks, setTracks] = useState(playlist.tracks || []);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(playlist.name || "Untitled");
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Get or create user ID for rating tracking
  const getUserId = () => {
    let userId = localStorage.getItem("playlistRatingUserId");
    if (!userId) {
      userId = "user_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("playlistRatingUserId", userId);
    }
    return userId;
  };

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) {
      showToast("Name cannot be empty");
      return;
    }

    try {
      const res = await fetch(`http://localhost:8080/playlists/${playlist._id}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!res.ok) throw new Error();

      playlist.name = newName.trim(); // Update local
      setEditingName(false);
      showToast("Playlist name updated");
    } catch {
      showToast("Failed to update name");
    }
  };

  const handleRemoveTrack = async (trackId, trackName) => {
    setConfirmDialog({
      title: "Remove Track",
      message: `Remove "${trackName}" from this playlist?`,
      confirmLabel: "Remove",
      onConfirm: async () => {
        try {
          const res = await fetch(`http://localhost:8080/playlists/${playlist._id}/remove-track`, {
            method: "DELETE",
            headers: authHeaders(),
            body: JSON.stringify({ trackId }),
          });

          if (!res.ok) throw new Error();

          setTracks((prev) => prev.filter((t) => t.id !== trackId));
          showToast(`Removed "${trackName}"`);
        } catch {
          showToast("Failed to remove track");
        } finally {
          setConfirmDialog(null);
        }
      },
    });
  };

  useEffect(() => {
    async function enrichTracks() {
      const userId = getUserId();
      const enriched = await Promise.all(
        (playlist.tracks || []).map(async (t) => {
          try {
            const artistParam = encodeURIComponent(t.artist || "Unknown Artist");
            const trackNameParam = encodeURIComponent(t.title || t.name || "Unknown");

            const [globalRes, userRes] = await Promise.all([
              fetch(
                `http://localhost:8080/tracks/${t.id}/rating?artist=${artistParam}&trackName=${trackNameParam}`,
              ),
              fetch(
                `http://localhost:8080/tracks/${t.id}/user-rating?userId=${encodeURIComponent(userId)}`,
              ),
            ]);

            const globalData = await globalRes.json();
            const userData = await userRes.json();

            return {
              ...t,
              globalAvg: globalData.averageRating,
              userRatingCount: globalData.userRatingCount,
              userRating: userData.userRating,
            };
          } catch {
            return { ...t, globalAvg: null, userRatingCount: 0, userRating: null };
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
      const userId = getUserId();
      const res = await fetch("http://localhost:8080/tracks/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId,
          trackName: track?.title || track?.name || "",
          artist: track?.artist || "",
          rating,
          userId,
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
          {editingName ? (
            <div className="pl-name-edit">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="pl-name-input"
                maxLength={50}
              />
              <button className="pl-save-btn" onClick={handleSaveName}>
                ✓
              </button>
              <button className="pl-cancel-btn" onClick={() => { setEditingName(false); setNewName(playlist.name || "Untitled"); }}>
                ✕
              </button>
            </div>
          ) : (
            <div className="pl-title-row">
              <h1 className="pl-title">{playlist.name || "Untitled"}</h1>
              {isAdmin && (
                <button className="pl-edit-btn" onClick={() => setEditingName(true)}>
                  ✏️
                </button>
              )}
            </div>
          )}
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
                <div className="pl-track-title-row">
                  <div className="pl-track-title">
                    {t.title || t.name || "Unknown"}
                  </div>
                  <button
                    className="pl-remove-btn"
                    onClick={() => handleRemoveTrack(t.id, t.title || t.name || "Unknown")}
                    title="Remove from playlist"
                  >
                    🗑️
                  </button>
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
                      t.userRating >= n ? "active" : "",
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

      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
        />
      )}

      <div className={`pl-toast${toastVisible ? " show" : ""}`}>{toast}</div>
    </div>
  );
}

// =======================
// ROOT EXPORT
// =======================
export default function Playlists({ setPage, isAdmin }) {
  const [openPlaylist, setOpenPlaylist] = useState(null);

  if (openPlaylist) {
    return (
      <PlaylistDetail
        playlist={openPlaylist}
        onBack={() => setOpenPlaylist(null)}
        isAdmin={isAdmin}
      />
    );
  }
  return <PlaylistList onOpen={setOpenPlaylist} setPage={setPage} isAdmin={isAdmin} />;
}
