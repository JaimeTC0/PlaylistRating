import './head.css'

function Head({ setPage, currentPage }) {
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
        <a href="about.html" className="nav-link">
          About Us
        </a>
      </nav>
    </header>
  )
}

export default Head