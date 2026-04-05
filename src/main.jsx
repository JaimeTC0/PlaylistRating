import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./css.css";
import Head from "./header.jsx";
import ArtistGet from "./componets/ArtistGet.jsx";
import Foot from "./Foot.jsx";
import MainPage from "./MainPage.jsx";
import Playlists from "./componets/Playlists.jsx";
import Search from "./componets/Search.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ProtectedRoute from "./componets/ProtectedRoute.jsx";

function App() {
  const [page, setPage] = useState("home");
  const [selectedArtist, setSelectedArtist] = useState(null);
  const isAuthenticated = !!localStorage.getItem("token");

  // Render main layout pages
  const renderPage = () => {
    if (page === "home") return <MainPage setPage={setPage} setSelectedArtist={setSelectedArtist} />;
    if (page === "search") return <Search />;
    if (page === "artist") return <ArtistGet ArtistID={selectedArtist} setPage={setPage} />;
    if (page === "playlists") return <Playlists setPage={setPage} />;
  };

  return (
    <Routes>
      {/* Auth routes (no header/footer) */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Redirect root to login if not authenticated */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <>
              <Head setPage={setPage} currentPage={page} />
              {renderPage()}
              <Foot />
            </>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Protected main app routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <>
              <Head setPage={setPage} currentPage={page} />
              {renderPage()}
              <Foot />
            </>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

// create root and render
let Root = createRoot(document.getElementById("root"));
Root.render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
