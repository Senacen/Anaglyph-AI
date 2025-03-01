import { useState, useRef } from "react";
import "./styles/ImageUpload.css";

// @ts-ignore
function ImageUpload({ setIsDepthMapReadyStateLifter }) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
    const [depthMapIsLoading, setDepthMapIsLoading] = useState<boolean>(false);
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL;
    const maxDimension = import.meta.env.VITE_MAX_DIMENSION; // Client side resizing to reduce internet bandwidth

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
            // @ts-ignore
            ctx.drawImage(image, 0, 0, width, height);

            // Now send the image to the server
            canvas.toBlob(async (blob) => {
                if (blob) {
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
                            const imageUrl = URL.createObjectURL(blob);
                            setDepthMapUrl(null); // To unload the previous depth map image so the container will fit the new image
                            setDepthMapIsLoading(true); // Start loading spinner
                            setImageUrl(imageUrl);
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
        try {
            setIsDepthMapReadyStateLifter(false); // Set depth map ready to false to stop rendering anaglyph editor
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
        if (imageInputRef.current) {
            imageInputRef.current.click();
        }
    };

    return (
        <div>
            {imageUrl && (
            <div className="imagePairContainer">
                <div className="imagePairLeft">
                    <img src={imageUrl} alt="Uploaded" className="image" />
                </div>
                {depthMapIsLoading && <div className="loader"></div>}
                {depthMapUrl && (
                <div className="imagePairRight">
                    <img src={depthMapUrl} alt="Depth Map" className="image" />
                </div>
                )}
            </div>
            )}

            {/* Div around each button to put them on the rightmost and leftmost, with width 50% to make them half the page each
                and then div around that to make the gap centred on the page */}
            <div style={{display: "flex", justifyContent: "center", marginBottom: "50px"}}>
                <div style={{display: "flex", justifyContent: "right", width: "50%"}}>
                    <button onClick={handleUploadButtonClick} className="anaglyphButton">
                        Upload Image
                    </button>
                </div>
                <div style={{display: "flex", justifyContent: "left", width: "50%"}}>
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
