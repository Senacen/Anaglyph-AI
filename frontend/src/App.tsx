import './App.css'
import anaglyphAILogo from './assets/anaglyph_ai_pop_in.svg'
import ImageUpload from './ImageUpload.tsx'

function App() {

  return (
    <>
      <div>
          <img src={anaglyphAILogo}
               className = "responsive_title"
               alt= "Anaglyph AI Logo"/>
      </div>
        <ImageUpload/>

    </>
  )
}

export default App
