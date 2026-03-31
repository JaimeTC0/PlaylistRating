import {useState, useEffect} from "react";

function MainPage(){

    const [artists, setArtists] = useState([]);
    const [albums, setAlbums] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8080/allArtists")
        .then(res => res.json())
        .then(artistData => setArtists(artistData))
        .catch(err => console.log(err));
    }, []);

    useEffect(() => {
        fetch("http://localhost:8080/allAlbums")
        .then(res => res.json())
        .then(albumData => setAlbums(albumData))
        .catch(err => console.log(err));
    }, []);

    return(
        <>
            <p>Welcome Home</p>
            
            <h1>Artists</h1>

            <div className="MainDiv">
            {artists.map((artist, index) => (
                <div key={index} className="List">
                    <img src="https://placehold.co/150x150" className="AlbumCover"/>
                    <p>{artist.ArtistName}</p>
                </div>
            ))}
            </div>

            <h1>Recent Albums</h1>

            <div className="MainDiv">
            {albums.map((album, index) => (
                <div key={index} className="List">
                    <img src="https://placehold.co/150x150" className="AlbumCover"/>
                    <p>{album.AlbumName}</p>
                </div>
            ))}
            </div>
        </>
    )
}

export default MainPage