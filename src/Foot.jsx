

function Foot(){
    return(
        <footer className="site-footer">
            <div className="footer-inner">
                <p className="footer-brand">MYPLAYLIST.COM</p>
                <p className="footer-copy">Discover music, build playlists, and rate your favorite tracks.</p>
                <p className="footer-meta">&copy; {new Date().getFullYear()} MYPLAYLIST.COM. All rights reserved.</p>
            </div>
        </footer>
    )
}

export default Foot