import { useState, useRef } from "react";

function ImageUpload() {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);

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
        formData.append("file", imageFile); // Ensure this key matches your Flask app's expectation
        console.log("Uploading image...");

        try {
            const response = await fetch("http://localhost:8000/image", {
                method: "POST",
                body: formData,
            });
            console.log("Response status:", response.status); // Log response status
            if (response.ok) {
                const data = await response.json();
                console.log("Upload successful:", data);
                fetchImage();
            } else {
                console.error("Failed to upload image", response.statusText);
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

    const fetchImage = async () => {
        try {
            const response = await fetch("http://localhost:8000/image", {
                method: "GET",
            });
            if (response.ok) {
                const imageBlob = await response.blob();
                const imageUrl = URL.createObjectURL(imageBlob);
                setImageUrl(imageUrl);
                console.log("Image fetched successfully", imageUrl);

            } else {
                console.error("Failed to fetch image", response.statusText);
            }
        } catch (error) {
            console.error("Failed to fetch image", error);
        }
    }

    return (
        <div>
            <button onClick={handleButtonClick} className="anaglyph-button">
                Upload Image
            </button>
            <input
                type="file"
                accept="image/*"
                ref={imageInputRef}
                style={{ display: "none" }}
                onChange={handleImageChange} // Handle file input changes
            />
            {imageUrl && <img src={imageUrl} alt="Uploaded" />}

        </div>
    );
}

export default ImageUpload;
