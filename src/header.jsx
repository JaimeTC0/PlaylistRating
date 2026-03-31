import './head.css'

function goHome(){
  console.log("Going Home...");
  homePage();
}

function Head(){
  return (
    <>
         <header>
            <p className="PageHeader">MyPlaylist.com</p>

            <nav>
                <button onClick={goHome}>Main Page</button>
                <button href="services.html">Services</button>
                <button href="mission.html">Mission</button>
                <button href="about.html">About Us</button>
            </nav>
        </header>
    </>
  )
}

export default Head