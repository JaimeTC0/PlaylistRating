import {useState, useEffect, useRef} from "react";

function Carousel({ title, items, onItemClick, renderItem }) {
    const scrollRef = useRef(null);

    function scrollLeft() {
        scrollRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }

    function scrollRight() {
        scrollRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }

    return (
        <div className="CarouselSection">
            <h2>{title}</h2>
            <div className="CarouselWrapper">
                <button className="CarouselBtn" onClick={scrollLeft}>‹</button>
                <div className="CarouselTrack" ref={scrollRef}>
                    {items.length === 0 && <p>Loading...</p>}
                    {items.map((item, index) => (
                        <div key={index} className="CarouselCard" onClick={() => onItemClick(item)}>
                            {renderItem(item)}
                        </div>
                    ))}
                </div>
                <button className="CarouselBtn" onClick={scrollRight}>›</button>
            </div>
        </div>
    );
}

function MainPage({setPage, setSelectedArtist}){

    const [artists, setArtists] = useState([]);
    const [albums, setAlbums] = useState([]);
    const username = localStorage.getItem("username") || "User";

    useEffect(() => {
        fetch("http://localhost:8080/allArtists")
            .then(res => res.json())
            .then(data => setArtists(data))
            .catch(err => console.log(err));
    }, []);

    useEffect(() => {
        fetch("http://localhost:8080/allAlbums")
            .then(res => res.json())
            .then(data => {
                if(Array.isArray(data)) setAlbums(data)
            })
            .catch(err => console.log(err));
    }, []);
    
    function ArtistClicked(artist) {
        setSelectedArtist(artist.artistId);
        setPage("artist");
    }

    function AlbumClicked(album) {
        setSelectedArtist(album.artistId);
        setPage("artist");
    }

    return(
        <>  
            <h2 className="welcome-message">
                Welcome <span className="welcome-username">{username}</span>
            </h2>

            <Carousel
                title = "Recommended Artists"
                items={artists}
                onItemClick={ArtistClicked}
                renderItem = {(artist) => (
                    <>
                        <img src={artist.image || "https://placehold.co/150x150"} className="AlbumCover"/>
                        <p>{artist.Name}</p>
                    </>
                )}
            />

            <Carousel
                title = "Recommended Albums"
                items={albums}
                onItemClick={AlbumClicked}
                renderItem = {(album) => (
                    <>
                        <img src={album.image || "https://placehold.co/150x150"} className="AlbumCover"/>
                        <p>{album.AlbumName}</p>
                        <p>{album.ArtistName}</p>
                    </>
                )}
            />
        </>
    )
}

export default MainPage