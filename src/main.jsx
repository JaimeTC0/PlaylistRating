import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./css.css";
import Head from "./header.jsx";
import ArtistGet from "./componets/ArtistGet.jsx";
import Foot from "./Foot.jsx";
import MainPage from "./MainPage.jsx";
import Playlists from "./componets/Playlists.jsx"; // adjust path if needed

function App() {
  // page state: "home", "artist", or "ratings"
  const [page, setPage] = useState("home");
  const [selectedArtist, setSelectedArtist] = useState(null);

  // function to render the correct page
  const renderPage = () => {
    if (page === "home") return <MainPage setPage={setPage} setSelectedArtist={setSelectedArtist} />;
    if (page === "artist") return <ArtistGet ArtistID={selectedArtist} setPage={setPage} />;
    if (page === "playlists") return <Playlists />;
  };

  return (
    <>
      <Head setPage={setPage} currentPage={page} />
      {renderPage()}
      <Foot />
    </>
  );
}

// create root and render
let Root = createRoot(document.getElementById("root"));
Root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
