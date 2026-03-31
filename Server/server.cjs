const express = require('express');
const app = express();

//needed to facilitate MongoDB integration
const { MongoClient, ObjectId } = require('mongodb');

//needed for cross-origin resource sharing
const cors = require('cors');
app.use(cors());

//needed to extract info in request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));





const PORT = 8080;

//Replace GET with page information
app.get("/", (req, res) => {
    res.sendFile(__dirname + '/example.html');
});
app.get("/other", (req, res) => {
    res.send("Hello, again!");
});
app.listen(PORT, () => {
    console.log("Now listening on port " + PORT);
});








//example routing to support various HTTP request methods
app.get("/artists", (req, res) => {
    res.send("GET Request for Artists");
    console.log("GET was requested");
})

app.post("/artists", (req, res) => {
    res.send("POST Request for Artists");
    console.log("POST was requested");
})

app.put("/artists", (req, res) => {
    res.send("PUT Request for Artists");
    console.log("PUT was requested");
})

app.delete("/artists", (req, res) => {
    res.send("DELETE Request for Artists");
    console.log("DELETE was requested");
})


//sample routing that uses a variable 'id'
//put means update
app.put("/artists/:id", (req, res) => {
    res.send("GET Request for Artist ID: " + req.params.id);
    console.log(req.body);
    console.log("GET Request for Artist ID: " + req.params.id);
});








//sample routing that extracts the request's JSON
//and inserts it into a MongoDB collection called "Team"
app.post("/artists/:id", (req, res) => {
    res.send("POST Request for artists ID: " + req.params.id);
    console.log(req.body);
    console.log("POST Request for artists ID: " + req.params.id);

    try{
        let collection = db.collection("Artists");
        let result = collection.insertOne(req.body);
    }
    catch(e){
        console.log(e);
    }
});

//Get Artist from database to show information
app.get("/artists/:id", async (req, res) => {

    try{
        let collection = db.collection("Artists");
        let result = await collection.findOne({ArtistID: req.params.id});

        if(!result){
            res.status(404).json({ message: "Artist not found" });
            return;
        }
        res.json(result);
    }
    catch(e){
        console.log(e);
        res.status(500).json({ message: "Server error" });
    }
});

app.get("/albums/:ArtistID", async (req,res) => {
    try{
        let collection = db.collection("Albums");
        let result = await collection.find({ ArtistID: req.params.ArtistID}).toArray();

        if(result.length === 0){
            res.status(404).json({message: "No albums found"});
            return;
        }
        res.json(result);
    }
    catch(e){
        console.log(e);
        res.status(500).json({ message: "Server error" });
    }
});


app.get("/allArtists", async (req, res) => {
    try{
        let collection = db.collection("Artists");
        let result = await collection.find().toArray();
        res.json(result);
    }
    catch(e){
        console.log(e);
    }
});



//used to establish a connection between the web server
//and the MongoDB server
async function connectDB(){
    const uri = "mongodb://localhost:27017/";
    const client = new MongoClient(uri);

    try{
        await client.connect();
        db = client.db("Playlist");
    }
    catch(error){
        console.log(error);
        return null;
    }
}

connectDB();