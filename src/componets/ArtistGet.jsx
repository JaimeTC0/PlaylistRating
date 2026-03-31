import {useState} from "react";

function ArtistGet(){
    const [ArtistID, setArtistID] = useState(null);
    const [ArtistName, setArtistname] = useState(null);
    const [foundArtist, setFoundArtist] = useState(null);
    const [albums, setAlbums] = useState([]);

    function doSpecificArtist()
    {
        //Save Data
        let artistDocument = {ArtistID: ArtistID, ArtistName: ArtistName};
        fetch("http://localhost:8080/artists/" + ArtistID, {
            method:"POST",
            body: JSON.stringify(artistDocument),
            headers: 
            {'Accept': 'application/json','Content-Type': 'application/json'}
        })
        .then(response => console.log(response));
    }

    function getSpecificArtist()
    {
        console.log("Searching for:", ArtistID);
        Promise.all([
            fetch("http://localhost:8080/artists/" + ArtistID).then(res => res.json()),
            fetch("http://localhost:8080/albums/" + ArtistID).then(res => {
            if (!res.ok){
                return [];
            }
            return res.json();
            })
        ])

        .then(([artistData, albumsData]) => {
            setFoundArtist(artistData);
            setAlbums(albumsData);
        })
        .catch(err => console.log(err));
    }

    return(
        <>
            <div>
            <input type="text" id="artistID" onChange={e => setArtistID(e.target.value)}/><br></br>
            <button onClick={getSpecificArtist}>Get Specific Artist</button>

            {/* Display the result on the page */}
            {foundArtist && (
                <div>
                    <h1 className="ArtistName">{foundArtist.ArtistName}</h1>
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