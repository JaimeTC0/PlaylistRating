import { useEffect, useState } from "react";

export default function Ratings() {
  const [playlists, setPlaylists] = useState([]);

  // fetch playlists from server
  useEffect(() => {
    fetch("http://localhost:3000/playlists")
      .then(res => res.json())
      .then(data => setPlaylists(data));
  }, []);

  // send rating
  const handleRating = (id, rating) => {
    fetch("http://localhost:3000/rate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, rating }),
    })
    .then(res => res.json())
    .then(updated => {
      setPlaylists(updated);
    });
  };

  return (
    <div>
      <h1>Rate Playlists</h1>

      {playlists.map(p => (
        <div key={p.id} style={{ marginBottom: "20px" }}>
          <h3>{p.name}</h3>
          <p>Rating: {p.rating || 0}</p>

          {[1,2,3,4,5].map(num => (
            <button key={num} onClick={() => handleRating(p.id, num)}>
              {num}⭐
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}