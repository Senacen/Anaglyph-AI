import { useState, useRef } from "react";

// @ts-ignore
function ImageUpload({ setIsDepthMapReadyStateLifter }) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
    const [depthMapIsLoading, setDepthMapIsLoading] = useState<boolean>(false);

    const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const selectedImage = files[0]; // Get the selected image file
            console.log("Selected file:", selectedImage); // Log the selected file
            setIsDepthMapReadyStateLifter(false); // Set depth map ready to false to stop rendering anaglyph editor
            await handleImageUpload(selectedImage); // Call upload function
            const imageUrl = URL.createObjectURL(selectedImage);
            setDepthMapUrl(null); // To unload the previous depth map image so the container will fit the new image
            setImageUrl(imageUrl);
        } else {
            console.error("No files selected");
        }
    };

    const handleImageUpload = async (imageFile: File) => {
        const formData = new FormData();
        formData.append("file", imageFile);
        console.log("Uploading image...");

        try {
            const response = await fetch("http://localhost:8000/image", {
                method: "POST",
                body: formData,
                credentials: "include",
            });
            console.log("Response status:", response.status); // Log response status
            if (response.ok) {
                const data = await response.json();
                console.log("Upload successful:", data);
                setDepthMapIsLoading(true); // Start loading spinner
                // Don't use await, causes error where depth map is not shown
                fetchDepthMap();
            } else {
                console.error("Failed to upload image", response.json());
            }
        } catch (error) {
            console.error("Failed to upload image", error);
        }
    };

    const handleButtonClick = () => {
        if (imageInputRef.current) {
            imageInputRef.current.click();
        }
    };

    const fetchDepthMap = async () => {
        try {
            const response = await fetch("http://localhost:8000/depth-map", {
                method: "GET",
                credentials: "include",
            });
            if (response.ok) {
                setDepthMapIsLoading(false); // Stop loading spinner
                const depthMapBlob = await response.blob();
                const depthMapUrl = URL.createObjectURL(depthMapBlob);
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

    return (
        <div>
            <button onClick={handleButtonClick} className="anaglyphButton">
                Upload Image
            </button>
            <input
                type="file"
                accept="image/jpeg, image/jpg, image/gif, image/png"
                ref={imageInputRef}
                style={{ display: "none" }}
                onChange={handleImageChange} // Handle file input changes
            />
            <div className="imagePairContainer">
                {imageUrl && (
                    <div className="imagePairWithTitle">
                        <h3>Image</h3>
                        <img src={imageUrl} alt="Uploaded" className="imagePair" />
                    </div>
                )}
                {depthMapIsLoading && <div className="loader"></div>}
                {depthMapUrl && (
                    <div className="imagePairWithTitle">
                        <h3>Depth Map</h3>
                        <img src={depthMapUrl} alt="Depth Map" className="imagePair" />
                    </div>
                )}
            </div>
        </div>
    );
}

export default ImageUpload;
