# Installing things
- Run 'npm install' in the root directory to install the app dependencies
- Make sure MongoDB is running (locally, docker, etc)

# Environment file
- Put your backend .env file in 'Server/.env'
- Should include: MONGO_URI, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, LASTFM_KEY (look in the discord in the off-topic channel)

# Starting the app
- Open a terminal in the root directory
- Run 'npm run dev' to start the frontend on 'http://localhost:5173'
- Open a second terminal in the root directory
- Run 'node Server/server.cjs' to start the backend on 'http://localhost:8080'

# Navigating to the web page
- Once both servers are running, open a web browser
- Go to 'http://localhost:5173/'
- Log in or sign up, then use the app

# Required collections
Database Name: Playlist
- Collection 1: Playlists
- Collection 2: TrackRatings
- Collection 3: Users
- Collection 4: Artists
- Collection 5: Albums

# Notes
- The backend uses the native MongoDB driver
- Login and signup use '/api/auth/login' and '/api/auth/signup'
- The popular tracks list is cached on the server to reduce Spotify rate limits
- Main page recommendations are stored in CSVs to reduce
the Spotify rate limits