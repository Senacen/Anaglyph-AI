import { useEffect, useRef, useState } from "react";
import "./styles/ImageUpload.css";
import ResizeObserver from "react-resize-observer"; // To trigger re calculation of image pair layout on window resize
import { Source } from "./stereo";

interface Props {
    source: Source | null;
    loading: boolean;
    onFile: (file: Blob) => void;
    onRandom: () => void;
}

function firstImage(files: FileList | null | undefined): File | null {
    if (!files) return null;
    for (const file of Array.from(files)) if (file.type.startsWith("image/")) return file;
    return null;
}

function ImageUpload({ source, loading, onFile, onRandom }: Props) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [windowDimensions, setWindowDimensions] = useState({
        width: window.innerWidth,
        height: window.innerHeight,
    }); // State just to change, so that the component re-renders

    // Drag and drop an image anywhere on the page, or paste one (Ctrl/Cmd+V)
    useEffect(() => {
        let dragDepth = 0; // dragenter/leave fire for every child element, so count them
        const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth++;
            setDragging(true);
        };
        const onDragOver = (e: DragEvent) => {
            if (hasFiles(e)) e.preventDefault(); // required for drop to fire
        };
        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) setDragging(false);
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth = 0;
            setDragging(false);
            const file = firstImage(e.dataTransfer?.files);
            if (file && !loading) onFile(file);
        };
        const onPaste = (e: ClipboardEvent) => {
            const file = firstImage(e.clipboardData?.files);
            if (!file) return;
            e.preventDefault();
            if (!loading) onFile(file);
        };
        window.addEventListener("dragenter", onDragEnter);
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        window.addEventListener("paste", onPaste);
        return () => {
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
            window.removeEventListener("paste", onPaste);
        };
    }, [loading, onFile]);

    const aspectRatioAndAreaDimensionsToCoveredArea = (aspectRatio: number, areaWidth: number, areaHeight: number) => {
        let width = areaWidth; // Start with full width
        let height = width / aspectRatio; // Calculate height based on aspect ratio
        // If the calculated height exceeds areaHeight, scale down
        if (height > areaHeight) {
            height = areaHeight;
            width = height * aspectRatio; // Recalculate width based on the height
        }
        return width * height;
    };

    const imagePair = (source: Source) => {
        const imageAspectRatio = source.width / source.height;
        // If change these display sizes in CSS, make sure to them here as well
        const areaWidth = windowDimensions.width * 0.95; // 95% of the window width
        const areaHeight = windowDimensions.height * 0.7; // 70vh in css
        const rowArea = aspectRatioAndAreaDimensionsToCoveredArea(imageAspectRatio * 2, areaWidth, areaHeight);
        const columnArea = aspectRatioAndAreaDimensionsToCoveredArea(imageAspectRatio / 2, areaWidth, areaHeight);
        const layout = rowArea > columnArea ? "Row" : "Column";
        return (
            <div className={`imagePairContainer${layout}`}>
                <div className={`imagePairLeft${layout}`}>
                    <img src={source.imageUrl} alt="Uploaded" className="image" />
                </div>
                <div className={`imagePairRight${layout}`}>
                    <img src={source.depthColourUrl} alt="Depth Map" className="image" />
                </div>
            </div>
        );
    };

    return (
        <div>
            {dragging && <div className="dropOverlay">Drop image to convert</div>}
            {loading && <div className="loaderRow"><div className="loader"></div></div>}
            {source && !loading && imagePair(source)}
            {!source && !loading && (
                <p className="hint">Upload, drag in or paste a photo, or try a random one.</p>
            )}
            {/* Resize Observer to detect window size changes and retrigger the layout choice */}
            <ResizeObserver
                onResize={() => {
                    setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
                }}
            />
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "right", width: "50%" }}>
                    <button onClick={() => imageInputRef.current?.click()} className="anaglyphButton" disabled={loading}>
                        Upload Image
                    </button>
                </div>
                <div style={{ display: "flex", justifyContent: "left", width: "50%" }}>
                    <button onClick={onRandom} className="anaglyphButton" disabled={loading}>
                        Random Image
                    </button>
                </div>
            </div>
            <input
                type="file"
                accept="image/*"
                ref={imageInputRef}
                style={{ display: "none" }}
                onChange={(event) => {
                    const file = firstImage(event.target.files);
                    // Reset so choosing the same file again still fires onChange
                    event.target.value = "";
                    if (file) onFile(file);
                }}
            />
        </div>
    );
}

export default ImageUpload;
