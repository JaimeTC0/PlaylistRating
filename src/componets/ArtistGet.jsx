import {useState, useEffect} from "react";

function ArtistGet({ArtistID, setPage}){
    const [foundArtist, setFoundArtist] = useState(null);
    const [albums, setAlbums] = useState([]);


    useEffect(() => {
        if (!ArtistID) return;

        Promise.all([
            fetch("http://localhost:8080/artists/" + ArtistID).then(res => {
                if (!res.ok) return null;
                return res.json();
            }),
            fetch("http://localhost:8080/albums/" + ArtistID).then(res => {
                if (!res.ok) return [];
                return res.json();
            })
        ])
        .then(([artistData, albumsData]) => {
            setFoundArtist(artistData);
            setAlbums(albumsData);
        })
        .catch(err => console.log(err));
    }, [ArtistID]); 

    return(
        <>
            {!foundArtist && <p>No Artist Found</p>}

            <div>
            {/* Display the result on the page */}
            {foundArtist && (
                <div>
                    <h1 className="ArtistName">{foundArtist.Name}</h1>
                    <p>Age: {foundArtist.Age}</p>
                    <p>Rating: {foundArtist.Rating}</p>
                </div>
            )}

            </div>

            {/* Show albums list */}
            {albums.length > 0 && (
                <div className="AlbumList">
                    <h2>Albums:</h2>
                    {albums.map((album, index) => (
                        <div key={index} className="ListInfo">
                            <img src="https://placehold.co/150x150" className="AlbumCover"/>
                            <p>Album: {album.AlbumName}</p>
                            <p>Year: {album.Year}</p>
                        </div>
                    ))}
                </div>
            )}
            {foundArtist && albums.length === 0 && (
                <p>No Albums Found</p>
            )}
        </>
    )
}

export default ArtistGet