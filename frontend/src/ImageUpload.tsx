import {useState, useRef} from "react";
import "./styles/ImageUpload.css";
import ResizeObserver from 'react-resize-observer'; // To trigger re calculation of image pair layout on window resize

// @ts-ignore
function ImageUpload({ setIsDepthMapReadyStateLifter, isUploadReady, setIsUploadReadyStateLifter }) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
    const [depthMapIsLoading, setDepthMapIsLoading] = useState<boolean>(false);
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL;
    const maxDimension = import.meta.env.VITE_MAX_DIMENSION; // Client side resizing to reduce internet bandwidth
    const [imageAspectRatio, setImageAspectRatio] = useState<number>(0); // width / height
    const [windowDimensions, setWindowDimensions] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    }); // State just to change, so that the component re-renders

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        // Uploading, so block the upload buttons
        setIsUploadReadyStateLifter(false);

        const files = event.target.files;
        if (files && files.length > 0) {
            const selectedImage = files[0]; // Get the selected image file
            console.log("Selected file:", selectedImage); // Log the selected file
            await handleImageUpload(selectedImage); // Call upload function
        } else {
            console.error("No files selected");
        }
    };

    const handleImageUpload = async (imageFile: File) => {
        const formData = new FormData();

        // Resize image to maxDimension to reduce internet bandwidth
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const image = new Image();

        image.onload = async () => {

            let width = image.width;
            let height = image.height;

            if (width > height) {
                if (width > maxDimension) {
                    height *= maxDimension / width;
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width *= maxDimension / height;
                    height = maxDimension;
                }
            }

            canvas.width = width;
            canvas.height = height;

            // Set the image aspect ratio to the width / height for choosing row or column
            setImageAspectRatio(width / height);

            // @ts-ignore
            ctx.drawImage(image, 0, 0, width, height);

            // Now send the image to the server
            canvas.toBlob(async (blob) => {
                if (blob) {
                    // Display the image they uploaded as soon as possible
                    const imageUrl = URL.createObjectURL(blob);
                    setImageUrl(imageUrl);

                    formData.append("file", blob, imageFile.name);
                    console.log("Uploading image...");

                    try {
                        setIsDepthMapReadyStateLifter(false); // Set depth map ready to false to stop rendering anaglyph editor
                        const response = await fetch(`${apiUrl}/image`, {
                            method: "POST",
                            body: formData,
                            credentials: "include",
                        });
                        console.log("Response status:", response.status); // Log response status
                        if (response.ok) {
                            const data = await response.json();
                            console.log("Upload successful:", data);

                            setDepthMapUrl(null); // To unload the previous depth map image so the container will fit the new image
                            setDepthMapIsLoading(true); // Start loading spinner
                            // Don't use await, causes error where depth map is not shown
                            fetchDepthMap();
                        } else {
                            console.error("Failed to upload image", response.json());
                        }
                    } catch (error) {
                        console.error("Failed to upload image", error);
                    }
                }
            }, "image/jpeg");
        };

        image.src = URL.createObjectURL(imageFile);
    };


    const handleRandomButtonClick = async () => {
        // Check if the upload is ready (so image upload, depth map retrieval and anaglyph generation is done)
        if (isUploadReady == false) return;
        try {
            setIsDepthMapReadyStateLifter(false); // Set depth map ready to false to stop rendering anaglyph editor
            // Uploading, so block the upload buttons
            setIsUploadReadyStateLifter(false);
            const response = await fetch(`${apiUrl}/random_image`, {
                method: "GET",
                credentials: "include",
            });
            if (response.ok) {
                const randomImageBlob = await response.blob();
                if (randomImageBlob.size === 0) {
                    console.error("Random image is empty");
                    return;
                }
                const randomImageUrl = URL.createObjectURL(randomImageBlob);
                setDepthMapUrl(null); // To unload the previous depth map image so the container will fit the new image
                setDepthMapIsLoading(true); // Start loading spinner
                setImageUrl(randomImageUrl);

                // Create an image to get its dimensions
                const image = new Image();
                image.onload = () => {
                    // Set the aspect ratio when the image loads
                    setImageAspectRatio(image.width / image.height);
                };
                image.src = randomImageUrl;

                // Don't use await, causes error where depth map is not shown
                fetchDepthMap();
            } else {
                console.error("Failed to fetch random image", response.statusText);
            }
        } catch (error) {
            console.error("Failed to fetch random image", error);
        }
    }

    const fetchDepthMap = async () => {
        try {
                // Sleep for 1 second to allow the server to process the image
            const response = await fetch(`${apiUrl}/depth-map`, {
                method: "GET",
                credentials: "include",
            });
            if (response.ok) {
                const depthMapBlob = await response.blob();
                if (depthMapBlob.size === 0) {
                    console.error("Depth map is empty");
                    return;
                }
                const depthMapUrl = URL.createObjectURL(depthMapBlob);
                setDepthMapIsLoading(false); // Stop loading spinner
                setDepthMapUrl(depthMapUrl);
                console.log("Depth map fetched successfully", depthMapUrl);
                setIsDepthMapReadyStateLifter(true); // Set depth map ready to true to start rendering anaglyph editor

            } else {
                console.error("Failed to fetch depth map", response.statusText);
            }
        } catch (error) {
            console.error("Failed to fetch depth map", error);
        }
    }

     const handleUploadButtonClick = () => {
        // Check if the upload is ready (so image upload, depth map retrieval and anaglyph generation is done)
        if (isUploadReady == false) return;
        if (imageInputRef.current) {
            imageInputRef.current.click();
        }
    };

    const aspectRatioAndAreaDimensionsToCoveredArea = (aspectRatio: number, areaWidth: number, areaHeight: number) => {
        let width = areaWidth; // Start with full width
        let height = width / aspectRatio; // Calculate height based on aspect ratio
        // If the calculated height exceeds areaHeight, scale down
        if (height > areaHeight) {
            height = areaHeight;
            width = height * aspectRatio; // Recalculate width based on the height
        }
        // Calculate area for aspect ratio
        return width * height;
    }

    const imagePairBestSpaceLayout = () => {
        const rowAspectRatio = imageAspectRatio * 2; // Doubling width
        const columnAspectRatio = imageAspectRatio / 2; // Doubling height

        // If change these display sizes in CSS, make sure to them here as well
        const areaWidth = windowDimensions.width * 0.95; // 95% of the window width, as root has margins
        const areaHeight = windowDimensions.height * 0.85; // 70% of the window height in css "height: 70vh; /* to always see the logo and the buttons*/"
        // Actually I tweaked it, for some reason even though 0.7 would be the correct value, 0.85 turned out better
        // As it switches  when the areas of each layout are closer to each other

        // Calculate the area covered by each layout
        const rowArea = aspectRatioAndAreaDimensionsToCoveredArea(rowAspectRatio, areaWidth, areaHeight);
        const columnArea = aspectRatioAndAreaDimensionsToCoveredArea(columnAspectRatio, areaWidth, areaHeight);

        if (rowArea > columnArea) {
            // Return row layout
            return (
                <div className="imagePairContainerRow">
                    <div className="imagePairLeftRow">
                        <img src={imageUrl!} alt="Uploaded" className="image" />
                    </div>
                    {depthMapIsLoading && <div className="loader"></div>}
                    {depthMapUrl && (
                    <div className="imagePairRightRow">
                        <img src={depthMapUrl!} alt="Depth Map" className="image" />
                    </div>
                    )}
                </div>
            );
        } else {
            // Return column layout
            return (
                <div className="imagePairContainerColumn">
                    <div className="imagePairLeftColumn">
                        <img src={imageUrl!} alt="Uploaded" className="image" />
                    </div>
                    {depthMapIsLoading && <div className="loader"></div>}
                    {depthMapUrl && (
                    <div className="imagePairRightColumn">
                        <img src={depthMapUrl!} alt="Depth Map" className="image" />
                    </div>
                    )}
                </div>
            );
        }
    }




    return (
        <div>
            {imageUrl && imagePairBestSpaceLayout()}
            {/* Resize Observer to detect window size changes and retrigger the above line*/}
            <ResizeObserver
                // Originaly used onResize{(width, height) and then set window dimensions to width and height
                // but this is just wrong. Messes up height at start, and is much smaller than the actual window size
                // Most likely onResize is working on a specific element, not the window
                onResize={() => {
                    setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
                }}
            />

            {/* Div around each button to put them on the rightmost and leftmost, with width 50% to make them half the page each
                and then div around that to make the gap centred on the page. Also only render if anaglyph is done */}
           <div style={{ display: "flex", justifyContent: "center", marginBottom: "50px" }}>
                <div style={{ display: "flex", justifyContent: "right", width: "50%" }}>
                    <button onClick={handleUploadButtonClick} className="anaglyphButton">
                        Upload Image
                    </button>
                </div>
                <div style={{ display: "flex", justifyContent: "left", width: "50%" }}>
                    <button onClick={handleRandomButtonClick} className="anaglyphButton">
                        Random Image
                    </button>
                </div>
            </div>


            <input
                type="file"
                accept="image/jpeg, image/jpg, image/gif, image/png"
                ref={imageInputRef}
                style={{ display: "none" }}
                onClick={(event) => {
                    // Reset the input value to null to ensure onChange fires even if the same file is selected
                    // Needed as random image doesn't change the image, so after a random image
                    // when the previous image is selected it sees it as no change
                    // However, clicking the button calls the click to the input again, so setting value to ""
                    // will ensure the onChange will fire as "" is different to the previous value
                    event.currentTarget.value = "";}}
                onChange={handleImageChange} // Handle file input changes
            />
        </div>
    );
}

export default ImageUpload;
