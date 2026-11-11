import { useEffect, useRef, useState } from "react";
import "./styles/ImageUpload.css";
import ResizeObserver from "react-resize-observer"; // To trigger re calculation of image pair layout on window resize
import { Source } from "./stereo";
import { Progress, Timings } from "./loadSource";

interface Props {
    source: Source | null;
    loading: boolean;
    progress: Progress | null;
    onFile: (file: Blob) => void;
    onRandom: () => void;
}

function firstImage(files: FileList | null | undefined): File | null {
    if (!files) return null;
    for (const file of Array.from(files)) if (file.type.startsWith("image/")) return file;
    return null;
}

/**
 * Stand-in for the depth map while it loads: the photo, faded, laid out exactly as the depth map will be,
 * with the spinner measured onto its centre (so it sits where the depth map will appear in any layout).
 */
function DepthPlaceholder({ imageUrl }: { imageUrl: string }) {
    const imageRef = useRef<HTMLImageElement>(null);
    const [centre, setCentre] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => {
        const image = imageRef.current;
        if (!image) return;
        const update = () => setCentre({ x: image.offsetLeft + image.offsetWidth / 2, y: image.offsetTop + image.offsetHeight / 2 });
        const observer = new window.ResizeObserver(update);
        observer.observe(image);
        image.addEventListener("load", update);
        update();
        return () => { observer.disconnect(); image.removeEventListener("load", update); };
    }, [imageUrl]);
    return (
        <>
            <img ref={imageRef} src={imageUrl} alt="" className="image depthPlaceholderImage" />
            {centre && <div className="loader depthPlaceholderSpinner" style={{ left: centre.x, top: centre.y }}></div>}
        </>
    );
}

const seconds = (ms?: number) => (ms === undefined ? null : `${(ms / 1000).toFixed(1)}s`);

/** e.g. "Photo prep 0.3s · Network 0.4s · Server 1.9s (model 1.7s) · Depth prep 0.2s" */
function timingSummary(t?: Timings): string | null {
    if (!t) return null;
    const parts = [
        t.resize !== undefined && `Photo prep ${seconds(t.resize)}`,
        t.network !== undefined && `Network ${seconds(t.network)}`,
        t.server !== undefined && `Server ${seconds(t.server)}${t.model !== undefined ? ` (model ${seconds(t.model)})` : ""}`,
        t.prepare !== undefined && `Depth prep ${seconds(t.prepare)}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

function ImageUpload({ source, loading, progress, onFile, onRandom }: Props) {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    // Aspect ratio of the photo being loaded, so the preview uses the same row/column layout as the result
    const [previewAspect, setPreviewAspect] = useState<number | null>(null);
    useEffect(() => {
        if (!progress?.previewUrl) return;
        const image = new Image();
        image.onload = () => setPreviewAspect(image.naturalWidth / image.naturalHeight);
        image.src = progress.previewUrl;
    }, [progress?.previewUrl]);
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

    // While loading, `depthUrl` is null and a spinner stands in for the depth map
    const imagePair = (imageUrl: string, depthUrl: string | null, imageAspectRatio: number) => {
        // If change these display sizes in CSS, make sure to them here as well
        const areaWidth = windowDimensions.width * 0.95; // 95% of the window width
        const areaHeight = windowDimensions.height * 0.7; // 70vh in css
        const rowArea = aspectRatioAndAreaDimensionsToCoveredArea(imageAspectRatio * 2, areaWidth, areaHeight);
        const columnArea = aspectRatioAndAreaDimensionsToCoveredArea(imageAspectRatio / 2, areaWidth, areaHeight);
        const layout = rowArea > columnArea ? "Row" : "Column";
        return (
            <div className={`imagePairContainer${layout}`}>
                <div className={`imagePairLeft${layout}`}>
                    <img src={imageUrl} alt="Uploaded" className="image" />
                </div>
                <div className={`imagePairRight${layout}`}>
                    {depthUrl ? <img src={depthUrl} alt="Depth Map" className="image" /> : (
                        // Same image and sizing as the depth map will have, faded, with the spinner on top:
                        // keeps the spinner centred on exactly where the depth map will appear
                        <DepthPlaceholder imageUrl={imageUrl} />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            {dragging && <div className="dropOverlay">Drop image to convert</div>}
            {loading && progress?.previewUrl && imagePair(progress.previewUrl, null, previewAspect ?? 1)}
            {loading && !progress?.previewUrl && <div className="loaderRow"><div className="loader"></div></div>}
            {source && !loading && imagePair(source.imageUrl, source.depthColourUrl, source.width / source.height)}
            <p className="status">
                {loading ? progress?.status ?? "Loading…" : timingSummary(source?.timings) ?? "\u00a0"}
            </p>
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
