import {useState, useEffect} from "react";

function MainPage({setPage, setSelectedArtist}){

    const [artists, setArtists] = useState([]);
    const [albums, setAlbums] = useState([]);

    useEffect(() => {
        fetch("http://localhost:8080/allArtists")
            .then(res => res.json())
            .then(data => setArtists(data))
            .catch(err => console.log(err));
    }, []);

    useEffect(() => {
        fetch("http://localhost:8080/allAlbums")
            .then(res => res.json())
            .then(data => setAlbums(data))
            .catch(err => console.log(err));
    }, []);
    
    function ArtistClicked(artistID) {
        setSelectedArtist(artistID);
        setPage("artist");
    }

    return(
        <>  
            <h1>Artists</h1>

            <div className="MainDiv">
            {artists.map((artist, index) => (
                <div key={index} className="MainList" onClick={() => ArtistClicked(artist.ArtistID)}>
                    <img src="https://placehold.co/150x150" className="AlbumCover"/>
                    <p>{artist.Name}</p>
                </div>
            ))}
            </div>

            <h1>Recent Albums</h1>

            <div className="MainDiv">
            {albums.map((album, index) => (
                <div key={index} className="MainList">
                    <img src="https://placehold.co/150x150" className="AlbumCover"/>
                    <p>{album.AlbumName}</p>
                </div>
            ))}
            </div>
        </>
    )
}

export default MainPage