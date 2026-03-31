import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "./css.css";
import Head from "./header.jsx";
import ArtistGet from "./componets/ArtistGet.jsx";
import Foot from "./Foot.jsx";
import MainPage from "./MainPage.jsx";
import Ratings from "./componets/Ratings.jsx"; // adjust path if needed

function App() {
  // page state: "home", "artist", or "ratings"
  const [page, setPage] = useState("home");

  // function to render the correct page
  const renderPage = () => {
    if (page === "home") return <MainPage />;
    if (page === "artist") return <ArtistGet />;
    if (page === "ratings") return <Ratings />;
  };

  return (
    <>
      <Head />

      {/* navigation buttons */}
      <div style={{ margin: "20px 0" }}>
        <button onClick={() => setPage("home")}>Home</button>
        <button onClick={() => setPage("artist")}>Artists</button>
        <button onClick={() => setPage("ratings")}>Ratings</button>
      </div>

      {/* main content */}
      {renderPage()}

      <Foot />
    </>
  );
}

// create root and render
let Root = createRoot(document.getElementById("root"));
Root.render(
  <StrictMode>
    <app />
  </StrictMode>,
);
