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
function DepthPlaceholder({ imageUrl, size }: { imageUrl: string; size: { width: number; height: number } }) {
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
            <img ref={imageRef} src={imageUrl} alt="" className="image depthPlaceholderImage" style={size} />
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
        t.network !== undefined && `Network ${seconds(t.network)}` +
            (t.upload !== undefined ? ` (connect ${seconds(t.connect)}, upload ${seconds(t.upload)}, download ${seconds(t.download)})` : ""),
        t.server !== undefined && `Server ${seconds(t.server)}${t.model !== undefined ? ` (model ${seconds(t.model)})` : ""}`,
        t.prepare !== undefined && `Depth prep ${seconds(t.prepare)}`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

function ImageUpload({ source, loading, progress, onFile, onRandom }: Props) {
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

    /** Largest width x height with the given aspect ratio that fits in the area. */
    const fit = (aspectRatio: number, areaWidth: number, areaHeight: number) => {
        let width = areaWidth;
        let height = width / aspectRatio;
        if (height > areaHeight) {
            height = areaHeight;
            width = height * aspectRatio;
        }
        return { width, height };
    };

    // While loading, `depthUrl` is null and a spinner stands in for the depth map
    const imagePair = (imageUrl: string, depthUrl: string | null, imageAspectRatio: number) => {
        // The pair may use up to 95% of the window width and 70% of its height
        const areaWidth = windowDimensions.width * 0.95;
        const areaHeight = windowDimensions.height * 0.7;
        // Side by side (pair is twice as wide) or stacked (twice as tall): pick whichever shows the images bigger
        const row = fit(imageAspectRatio * 2, areaWidth, areaHeight);
        const column = fit(imageAspectRatio / 2, areaWidth, areaHeight);
        const layout = row.width * row.height > column.width * column.height ? "Row" : "Column";
        // Give each image its exact size and make the area only as tall as the pair needs, so there is no empty
        // band left under the images (e.g. landscape photos stacked on a portrait phone)
        const image = layout === "Row"
            ? { width: Math.floor(row.width / 2), height: Math.floor(row.height) }
            : { width: Math.floor(column.width), height: Math.floor(column.height / 2) };
        const containerHeight = layout === "Row" ? image.height : image.height * 2;
        const size = { width: image.width, height: image.height };
        return (
            <div className={`imagePairContainer${layout}`} style={{ height: containerHeight }}>
                <div className={`imagePairLeft${layout}`}>
                    <img src={imageUrl} alt="Uploaded" className="image" style={size} />
                </div>
                <div className={`imagePairRight${layout}`}>
                    {depthUrl ? <img src={depthUrl} alt="Depth Map" className="image" style={size} /> : (
                        // Same image and size as the depth map will have, faded, with the spinner on its centre
                        <DepthPlaceholder imageUrl={imageUrl} size={size} />
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            {dragging && <div className="dropOverlay">Drop image to convert</div>}
            {/* Loading: the new photo (at its real aspect ratio) with a placeholder for the depth map; before the
                photo is ready, the previous pair stays in place (faded) so the page doesn't collapse and jump */}
            {loading && progress?.previewUrl && imagePair(progress.previewUrl, null, progress.aspect ?? 1)}
            {loading && !progress?.previewUrl && source && (
                <div className="fadedPair">{imagePair(source.imageUrl, source.depthColourUrl, source.width / source.height)}</div>
            )}
            {loading && !progress?.previewUrl && !source && <div className="loaderRow"><div className="loader"></div></div>}
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
