import { useState, useEffect } from "react";

function AnaglyphEditor({ isDepthMapReady }: { isDepthMapReady: boolean }) {
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL;
    const [anaglyphUrl, setAnaglyphUrl] = useState<string | null>(null);
    const [anaglyphIsLoading, setAnaglyphIsLoading] = useState<boolean>(false);

    // State for form inputs
    const [popOut, setPopOut] = useState<boolean>(false);
    const [maxDisparityPercentage, setMaxDisparityPercentage] = useState<number>(2); // Default value
    const [optimiseRRAnaglyph, setOptimiseRRAnaglyph] = useState<boolean>(false);
    const[sliderValue, setSliderValue] = useState<number>(2);

    // If the depth map is ready, fetch the anaglyph
    // Causes it be retriggered for every new depth map
    // Also if the settings change
     useEffect(() => {
        if (isDepthMapReady) {
            fetchAnaglyph();
        }
    }, [isDepthMapReady, popOut, maxDisparityPercentage, optimiseRRAnaglyph]);

    const fetchAnaglyph = async () => {
        try {
            setAnaglyphIsLoading(true); // Start loading spinner
            const response = await fetch(
                `${apiUrl}/anaglyph?pop_out=${popOut}&max_disparity_percentage=${maxDisparityPercentage}&optimised_RR_anaglyph=${optimiseRRAnaglyph}`,
                {
                    method: "GET",
                    credentials: "include",
                }
            );

            if (response.ok) {
                setAnaglyphIsLoading(false); // Stop loading spinner
                const anaglyphBlob = await response.blob();
                const anaglyphUrl = URL.createObjectURL(anaglyphBlob);
                setAnaglyphUrl(anaglyphUrl);
                console.log("Anaglyph fetched successfully", anaglyphUrl);
            } else {
                console.error("Failed to fetch Anaglyph", response.json());
            }
        } catch (error) {
            console.error("Failed to fetch Anaglyph", error);
        }
    };

    const handleSliderChange = (e: { target: { value: string; }; }) => {
        setSliderValue(parseFloat(e.target.value));
    }

    const handleSliderReleased = () => {
        setMaxDisparityPercentage(sliderValue)
    }

    const handleDownload = () => {
        const link = document.createElement("a");
        link.href = anaglyphUrl!; // Non-null assertion operator
        link.download = "anaglyph.jpeg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link); // Clean up, remove from dom
    }
    return (
        <div>
            <h1>Anaglyph</h1>
            <div className="anaglyphEditor">
                <form>
                    <label>
                        Pop Out
                        <input
                            type="checkbox"
                            checked={popOut}
                            onChange={(e) => setPopOut(e.target.checked)}
                        />
                    </label>
                </form>
                <form>
                    <label>
                        Strength
                        <input
                            type="range"
                            min="0"
                            max="6"
                            step="0.1"
                            value={sliderValue}
                            onChange={handleSliderChange}
                            onMouseUp={handleSliderReleased}
                            onTouchEnd={handleSliderReleased}
                        />
                    </label>
                </form>
                <form>
                    <label>
                        Minimise Retinal Rivalry
                        <input
                            type="checkbox"
                            checked={optimiseRRAnaglyph}
                            onChange={(e) => setOptimiseRRAnaglyph(e.target.checked)}
                        />
                    </label>
                </form>
            </div>
            {/* Below div is used to display loading spinner, otherwise the image will shift down while it loads then shift back up */}
            <div style={{display: "flex", height: "40px", justifyContent: "center", padding: "10px 0"}}>
                { anaglyphIsLoading && isDepthMapReady && <div className="loader"></div>} {/* Only show loader if depth map is ready but anaglyph is not*/}
                { (!anaglyphIsLoading && anaglyphUrl) && <button className="anaglyphButton" onClick={handleDownload}>Download</button>}
            </div>
            <div className="anaglyphImageContainer">
                {anaglyphUrl && <img src={anaglyphUrl} alt="Anaglyph" className="anaglyphImage"/>}
            </div>

        </div>
    );
}

export default AnaglyphEditor;
