import { useEffect, useState } from "react";
import "./Ratings.css";

export default function Ratings() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(null);
  const [toast, setToast]         = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    fetch("http://localhost:8080/playlists")
      .then(r => r.json())
      .then(data => { setPlaylists(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleRating = async (id, rating) => {
    setSaving(id);
    // Optimistic update
    setPlaylists(prev => prev.map(p => p._id === id ? { ...p, rating } : p));

    try {
      const res = await fetch("http://localhost:8080/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, rating }),
      });
      const updated = await res.json();
      setPlaylists(updated);
      showToast(`Rated ${rating}★`);
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="ratings-page">
      {/* Header */}
      <div className="ratings-header">
        <h1 className="ratings-title">
          RATE YOUR<br />
          <span className="ratings-title-accent">PLAYLISTS</span>
        </h1>
        <div className="ratings-divider" />
        <p className="ratings-sub">Your collection · Click a star to rate</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="ratings-loading">
          {[0, 1, 2].map(i => (
            <span key={i} className="ratings-dot" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="ratings-empty">
          <div className="ratings-empty-icon">♫</div>
          <p className="ratings-empty-text">No playlists found</p>
        </div>
      ) : (
        <div className="ratings-grid">
          {playlists.map((p, i) => {
            const rated = p.rating !== null && p.rating !== undefined;
            return (
              <div
                key={p._id}
                className="ratings-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="ratings-info">
                  <div className="ratings-name">{p.name || p.title || "Untitled"}</div>
                  <div className="ratings-meta">
                    <span className={rated ? "ratings-num" : "ratings-num unrated"}>
                      {rated ? p.rating : "—"}
                    </span>
                    <span className="ratings-label">
                      {rated ? "/ 5 rated" : "not yet rated"}
                    </span>
                  </div>
                </div>
                <div className="ratings-stars">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => handleRating(p._id, n)}
                      disabled={saving === p._id}
                      className={[
                        "ratings-star-btn",
                        p.rating === n ? "active" : "",
                        saving === p._id ? "saving" : "",
                      ].join(" ").trim()}
                    >★</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      <div className={`ratings-toast${toastVisible ? " show" : ""}`}>
        {toast}
      </div>
    </div>
  );
}