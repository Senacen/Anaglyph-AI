import { useState, useRef } from "react";

// @ts-ignore
function ImageUpload({ setIsDepthMapReadyStateLifter }) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [depthMapUrl, setDepthMapUrl] = useState<string | null>(null);
    const [depthMapIsLoading, setDepthMapIsLoading] = useState<boolean>(false);
    const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL;
    const maxDimension = 1500; // Client side resizing to reduce internet bandwidth

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
                        setImageUrl(imageUrl);
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

    const handleUploadButtonClick = () => {
        if (imageInputRef.current) {
            imageInputRef.current.click();
        }
    };

    const handleRandomButtonClick = async () => {
        try {
            // Lorem Picsum only has 1084 images, try and look for other service
            // Try and implement flickr, using node.js flickr-sdk for ease
            // Prefetch multiple images and store them in a list to reduce api calls
            const response = await fetch("https://picsum.photos/1500/1000?random=" + new Date().getTime());
            if (response.ok) {
                const randomImage = await response.blob();
                const randomImageFile = new File([randomImage], "randomImage.jpeg");
                console.log("Random image fetched successfully", randomImageFile);
                await handleImageUpload(randomImageFile); // Call upload function
            } else {
                console.error("Failed to fetch random image", response.statusText);
            }
        } catch (error) {
            console.error("Failed to fetch random image", error);
        }
    }

    const fetchDepthMap = async () => {
        try {
            const response = await fetch(`${apiUrl}/depth-map`, {
                method: "GET",
                credentials: "include",
            });
            if (response.ok) {
                setDepthMapIsLoading(false); // Stop loading spinner
                const depthMapBlob = await response.blob();
                if (depthMapBlob.size === 0) {
                    console.error("Depth map is empty");
                    return;
                }
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
            <div style={{display: "flex", justifyContent: "center"}}>
                <button onClick={handleUploadButtonClick} className="anaglyphButton">
                    Upload Image
                </button>
                <button onClick={handleRandomButtonClick} className="anaglyphButton">
                    Random Image
                </button>
            </div>

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
