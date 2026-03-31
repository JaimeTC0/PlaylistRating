import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './css.css'
import Head from './header.jsx'
import ArtistGet from './ArtistGet.jsx'
import Foot from './Foot.jsx'
import MainPage from './MainPage.jsx'

let Root = createRoot(document.getElementById('root'))

export function homePage(){
  Root.render(
    <StrictMode>
      <Head />
      <MainPage />
      <Foot />
    </StrictMode>,
  )

}

function artistPage(){
  Root.render(
      <StrictMode>
      <Head />
      <ArtistGet />
      <Foot />
    </StrictMode>,
  )
}

artistPage();




