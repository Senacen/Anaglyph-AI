import './styles/App.css'
import anaglyphAILogoLight from './assets/anaglyph_ai_pop_in_transparent_light_mode.svg'
import ImageUpload from './ImageUpload.tsx'
import { useState } from 'react'
import AnaglyphEditor from './AnaglyphEditor.tsx'
import Footer from './Footer.tsx'

function App() {
    const [isDepthMapReady, setIsDepthMapReady] = useState<boolean>(false)
    // This is to check if the anaglyph is done and the depth map has been retrieved and the image has been retrieved
    // , to prevent uploading a new image until it is done
    // Init to true so that the user can upload an image at the start
    const [isChangeAllowed, setIsUploadReady] = useState<boolean>(true)

    return (
        <>
            <div>
                <img src={anaglyphAILogoLight}
                   className="responsive_title"
                   alt="Anaglyph AI Logo"/>
            </div>
            <ImageUpload setIsDepthMapReadyStateLifter={setIsDepthMapReady} isChangeAllowed={isChangeAllowed} setIsUploadReadyStateLifter={setIsUploadReady}/>
            { <AnaglyphEditor isDepthMapReady={isDepthMapReady} isChangeAllowed={isChangeAllowed} setIsUploadReadyStateLifter={setIsUploadReady}/>}
            <Footer />
        </>
  )
}

export default App
