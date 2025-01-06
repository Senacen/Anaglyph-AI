import './App.css'
import anaglyphAILogoLight from './assets/anaglyph_ai_pop_in_transparent_light_mode.svg'
import ImageUpload from './ImageUpload.tsx'
import { useState } from 'react'
import AnaglyphEditor from './AnaglyphEditor.tsx'

function App() {
    const [isDepthMapReady, setIsDepthMapReady] = useState<boolean>(false)

    return (
        <>
            <div>
                <img src={anaglyphAILogoLight}
                   className="responsive_title"
                   alt="Anaglyph AI Logo"/>
            </div>
            <ImageUpload setIsDepthMapReadyStateLifter={setIsDepthMapReady}/>
            { isDepthMapReady && <AnaglyphEditor />}
        </>
  )
}

export default App
