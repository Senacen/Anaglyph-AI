import './App.css'
import anaglyphAILogoLight from './assets/anaglyph_ai_pop_in_transparent_light_mode.svg'
import ImageUpload from './ImageUpload.tsx'

function App() {

  return (
    <>
      <div>
          <img src={anaglyphAILogoLight}
               className="responsive_title"
               alt="Anaglyph AI Logo"/>

      </div>
        <ImageUpload/>

    </>
  )
}

export default App
