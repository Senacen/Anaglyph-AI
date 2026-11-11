import './styles/App.css'
import anaglyphAILogoLight from './assets/anaglyph_ai_pop_in_transparent_light_mode.svg'
import ImageUpload from './ImageUpload.tsx'
import { useCallback, useState } from 'react'
import AnaglyphEditor from './AnaglyphEditor.tsx'
import Footer from './Footer.tsx'
import { Source } from './stereo'
import { Progress, randomSource, sourceFromFile } from './loadSource'

function App() {
    const [source, setSource] = useState<Source | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState<Progress | null>(null)

    const load = useCallback(async (getSource: (onProgress: (p: Progress) => void) => Promise<Source>) => {
        setLoading(true)
        setError(null)
        setProgress(null)
        try {
            const next = await getSource(setProgress)
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
            setProgress(null)
        }
    }, [])

    const onFile = useCallback((file: Blob) => load((onProgress) => sourceFromFile(file, onProgress)), [load])
    const onRandom = useCallback(() => load(randomSource), [load])

    return (
        <>
            <div>
                <img src={anaglyphAILogoLight}
                   className="responsive_title"
                   alt="Anaglyph AI Logo"/>
            </div>
            <ImageUpload source={source} loading={loading} progress={progress} onFile={onFile} onRandom={onRandom}/>
            {error && <p className="error">{error}</p>}
            {source && <AnaglyphEditor source={source}/>}
            <Footer />
        </>
  )
}

export default App
