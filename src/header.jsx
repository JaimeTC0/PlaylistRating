import './head.css'
import { useNavigate } from 'react-router-dom'

function Head({ setPage, currentPage, isAdmin }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    navigate("/login");
  };

  return (
    <header className="header">
      <p className="PageHeader" onClick={() => setPage("home")}>
        MyPlaylist.com
      </p>

      <nav className="header-nav">
        <button
          onClick={() => setPage("home")}
          className={currentPage === "home" ? "active" : ""}
        >
          Home
        </button>
        <button
          onClick={() => setPage("search")}
          className={currentPage === "search" ? "active" : ""}
        >
          Search
        </button>
        <button
          onClick={() => setPage("artist")}
          className={currentPage === "artist" ? "active" : ""}
        >
          Artists
        </button>
        <button
          onClick={() => setPage("playlists")}
          className={currentPage === "playlists" ? "active" : ""}
        >
          Playlists
        </button>
        {isAdmin && (
          <button
            onClick={() => setPage("admin")}
            className={currentPage === "admin" ? "active" : ""}
          >
            Admin
          </button>
        )}
        <button onClick={handleLogout} className="nav-link logout-btn">
          Logout
        </button>
      </nav>
    </header>
  )
}

export default Head