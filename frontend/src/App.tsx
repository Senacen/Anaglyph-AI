import './styles/App.css'
import anaglyphAILogoLight from './assets/anaglyph_ai_pop_in_transparent_light_mode.svg'
import ImageUpload from './ImageUpload.tsx'
import { useCallback, useState } from 'react'
import AnaglyphEditor from './AnaglyphEditor.tsx'
import Footer from './Footer.tsx'
import { Source } from './stereo'
import { randomSource, sourceFromFile } from './loadSource'

function App() {
    const [source, setSource] = useState<Source | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async (getSource: () => Promise<Source>) => {
        setLoading(true)
        setError(null)
        try {
            const next = await getSource()
            setSource((previous) => {
                if (previous) {
                    URL.revokeObjectURL(previous.imageUrl)
                    URL.revokeObjectURL(previous.depthColourUrl)
                }
                return next
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    const onFile = useCallback((file: Blob) => load(() => sourceFromFile(file)), [load])
    const onRandom = useCallback(() => load(randomSource), [load])

    return (
        <>
            <div>
                <img src={anaglyphAILogoLight}
                   className="responsive_title"
                   alt="Anaglyph AI Logo"/>
            </div>
            <ImageUpload source={source} loading={loading} onFile={onFile} onRandom={onRandom}/>
            {error && <p className="error">{error}</p>}
            {source && <AnaglyphEditor source={source}/>}
            <Footer />
        </>
  )
}

export default App
