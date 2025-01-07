import { useState, useEffect } from "react";

function AnaglyphEditor() {
    const [anaglyphUrl, setAnaglyphUrl] = useState<string | null>(null);
    const [anaglyphIsLoading, setAnaglyphIsLoading] = useState<boolean>(false);

    // State for form inputs
    const [popOut, setPopOut] = useState<boolean>(false);
    const [maxDisparityPercentage, setMaxDisparityPercentage] = useState<number>(1); // Default value
    const [optimiseRRAnaglyph, setOptimiseRRAnaglyph] = useState<boolean>(false);
    const[sliderValue, setSliderValue] = useState<number>(1);

    const fetchAnaglyph = async () => {
        try {
            setAnaglyphIsLoading(true); // Start loading spinner
            const response = await fetch(
                `http://localhost:8000/anaglyph?pop_out=${popOut}&max_disparity_percentage=${maxDisparityPercentage}&optimised_RR_anaglyph=${optimiseRRAnaglyph}`,
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

    useEffect(() => {
        fetchAnaglyph();
    }, [popOut, maxDisparityPercentage, optimiseRRAnaglyph]);

    const handleSliderChange = (e: { target: { value: string; }; }) => {
        setSliderValue(parseFloat(e.target.value));
    }

    const handleSliderReleased = () => {
        setMaxDisparityPercentage(sliderValue)
    }


    return (
        <div>
            <form>
                <label>
                    Pop Out:
                    <input
                        type="checkbox"
                        checked={popOut}
                        onChange={(e) => setPopOut(e.target.checked)}
                    />
                </label>
                <br />
                <label>
                    Max Disparity Percentage:
                    <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.1"
                        value={sliderValue}
                        onChange={handleSliderChange}
                        onMouseUp={handleSliderReleased}
                        onTouchEnd={handleSliderReleased}
                    />
                </label>
                <br />
                <label>
                    Minimise Retinal Rivalry:
                    <input
                        type="checkbox"
                        checked={optimiseRRAnaglyph}
                        onChange={(e) => setOptimiseRRAnaglyph(e.target.checked)}
                    />
                </label>
                <br />
            </form>
            {anaglyphIsLoading && <div className="loader"></div>}
            {anaglyphUrl && <img src={anaglyphUrl} alt="Anaglyph" className="anaglyphImage"/>}
        </div>
    );
}

export default AnaglyphEditor;
