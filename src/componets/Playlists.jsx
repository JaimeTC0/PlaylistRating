import { useEffect, useState } from "react";
import "./Playlists.css";
import { optimisticUpdate } from "../ratingUtils"; // adjust path if needed

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState("name");
  const [ascending, setAscending] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8080/playlists")
      .then((r) => r.json())
      .then(async (data) => {
        // Fetch globalAvg for all playlists in parallel
        const enriched = await Promise.all(
          data.map(async (p) => {
            try {
              const res = await fetch(`http://localhost:8080/playlists/${p._id}/globalavg`);
              const { globalAvg } = await res.json();
              return { ...p, globalAvg };
            } catch {
              return { ...p, globalAvg: null };
            }
          })
        );
        setPlaylists(enriched);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleRating = async (id, rating) => {
    setSaving(id);

    // Optimistic update — show new avg instantly
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p._id !== id) return p;
        return {
          ...p,
          rating,
          globalAvg: optimisticUpdate(
            p.globalAvg,
            p.userRatingCount ?? 0,
            rating
          ),
        };
      })
    );

    try {
      const res = await fetch("http://localhost:8080/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, rating }),
      });
      const updated = await res.json();

      // Reconcile server response with local globalAvg values
      setPlaylists((prev) =>
        updated.map((p) => {
          const existing = prev.find((x) => x._id === p._id);
          return { ...p, globalAvg: existing?.globalAvg ?? null };
        })
      );

      showToast(`Rated ${rating}★`);
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(null);
    }
  };

  // Toggle sort field / direction
  const toggleSort = (field) => {
    if (sortBy === field) setAscending(!ascending);
    else {
      setSortBy(field);
      setAscending(true);
    }
  };

  // Sort playlists
  const sortedPlaylists = [...playlists].sort((a, b) => {
    let comp = 0;
    if (sortBy === "name") {
      comp = (a.name || "").localeCompare(b.name || "");
    } else if (sortBy === "user") {
      comp = (a.rating ?? 0) - (b.rating ?? 0);
    } else if (sortBy === "global") {
      comp = (a.globalAvg ?? 0) - (b.globalAvg ?? 0);
    }
    return ascending ? comp : -comp;
  });

  return (
    <div className="playlists-page">
      {/* Header */}
      <div className="playlists-header">
        <h1 className="playlists-title">
          YOUR<br />
          <span className="playlists-title-accent">PLAYLISTS</span>
        </h1>
        <div className="playlists-divider" />
        <p className="playlists-sub">Your collection · Click a star to rate</p>
      </div>

      {/* Table Headers */}
      {!loading && playlists.length > 0 && (
        <div className="playlists-table-header">
          <div className="playlists-col playlists-name-col" onClick={() => toggleSort("name")}>
            Name {sortBy === "name" && (ascending ? "▲" : "▼")}
          </div>
          <div className="playlists-col playlists-user-col" onClick={() => toggleSort("user")}>
            Your Rating {sortBy === "user" && (ascending ? "▲" : "▼")}
          </div>
          <div className="playlists-col playlists-global-col" onClick={() => toggleSort("global")}>
            Global Avg {sortBy === "global" && (ascending ? "▲" : "▼")}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="playlists-loading">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="playlists-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      ) : sortedPlaylists.length === 0 ? (
        <div className="playlists-empty">
          <div className="playlists-empty-icon">♫</div>
          <p className="playlists-empty-text">No playlists found</p>
        </div>
      ) : (
        <div className="playlists-grid">
          {sortedPlaylists.map((p, i) => {
            const rated = p.rating !== null && p.rating !== undefined;
            const globalAvg = p.globalAvg ?? "—";

            return (
              <div
                key={p._id}
                className="playlists-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="playlists-info">
                  <div className="playlists-name">
                    {p.name || p.title || "Untitled"}
                  </div>
                  <div className="playlists-meta">
                    <span className={rated ? "playlists-num" : "playlists-num unrated"}>
                      {rated ? p.rating : "—"}
                    </span>
                    <span className="playlists-label">
                      {rated ? "/ 5 rated" : "not yet rated"}
                    </span>
                    <span className="playlists-global">
                      Global Avg: {globalAvg}
                    </span>
                  </div>
                </div>
                <div className="playlists-stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => handleRating(p._id, n)}
                      disabled={saving === p._id}
                      className={[
                        "playlists-star-btn",
                        p.rating === n ? "active" : "",
                        saving === p._id ? "saving" : "",
                      ].join(" ").trim()}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Toast */}
      <div className={`playlists-toast${toastVisible ? " show" : ""}`}>
        {toast}
      </div>
    </div>
  );
}