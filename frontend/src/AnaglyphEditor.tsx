import { useEffect, useMemo, useRef, useState } from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import "./styles/AnaglyphEditor.css";
import { anaglyph, Eyes, eyeImage, makeEyes, OutputMode, sideBySide, Source } from "./stereo";

const WIGGLE_INTERVAL_MS = 130;
const WIGGLE_GIF_MAX_DIMENSION = 800; // keep downloaded GIFs a sensible size

const OUTPUT_NAMES: Record<OutputMode, string> = {
    "anaglyph": "Red–cyan anaglyph",
    "sbs-parallel": "Side by side (parallel)",
    "sbs-cross": "Side by side (cross-eye)",
    "wiggle": "Wiggle",
};

function toCanvas(data: ImageData, maxDimension = Infinity): HTMLCanvasElement {
    const full = document.createElement("canvas");
    full.width = data.width;
    full.height = data.height;
    full.getContext("2d")!.putImageData(data, 0, 0);
    const scale = Math.min(1, maxDimension / Math.max(data.width, data.height));
    if (scale === 1) return full;
    const small = document.createElement("canvas");
    small.width = Math.round(data.width * scale);
    small.height = Math.round(data.height * scale);
    small.getContext("2d")!.drawImage(full, 0, 0, small.width, small.height);
    return small;
}

function download(blob: Blob, name: string) {
    // Tried to use web share api so that on iphone it allows to save image to camera roll
    // But then on mac it doesn't allow downloading at all
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wiggleGif(eyes: Eyes): Blob {
    const frames = [eyeImage(eyes, "left"), eyeImage(eyes, "right")].map((frame) => {
        const canvas = toCanvas(frame, WIGGLE_GIF_MAX_DIMENSION);
        return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    });
    // One shared palette for both frames so colours don't flicker between them
    const combined = new Uint8ClampedArray(frames[0].data.length * 2);
    combined.set(frames[0].data, 0);
    combined.set(frames[1].data, frames[0].data.length);
    const palette = quantize(combined, 256);
    const gif = GIFEncoder();
    for (const frame of frames) {
        gif.writeFrame(applyPalette(frame.data, palette), frame.width, frame.height, { palette, delay: WIGGLE_INTERVAL_MS });
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
}

function AnaglyphEditor({ source }: { source: Source }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mode, setMode] = useState<OutputMode>("anaglyph");
    const [reduceRivalry, setReduceRivalry] = useState(false);
    const [strength, setStrength] = useState(2); // max disparity, % of image width
    const [plane, setPlane] = useState(1); // zero-parallax plane: 0 = everything pops out, 1 = everything sinks in

    // Recomputed live as the sliders move (all in the browser, no server round trip)
    const eyes = useMemo(() => makeEyes(source, source.depth, strength, plane), [source, strength, plane]);

    const output = useMemo<ImageData | null>(() => {
        if (mode === "anaglyph") return anaglyph(eyes, reduceRivalry);
        if (mode === "sbs-parallel") return sideBySide(eyes, false);
        if (mode === "sbs-cross") return sideBySide(eyes, true);
        return null; // wiggle is animated below
    }, [eyes, mode, reduceRivalry]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        if (output) {
            canvas.width = output.width;
            canvas.height = output.height;
            ctx.putImageData(output, 0, 0);
            return;
        }
        const frames = [eyeImage(eyes, "left"), eyeImage(eyes, "right")];
        canvas.width = eyes.width;
        canvas.height = eyes.height;
        let frame = 0;
        ctx.putImageData(frames[0], 0, 0);
        const timer = setInterval(() => {
            frame = 1 - frame;
            ctx.putImageData(frames[frame], 0, 0);
        }, WIGGLE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [output, eyes]);

    const handleDownload = () => {
        if (mode === "wiggle") {
            download(wiggleGif(eyes), "anaglyph-ai-wiggle.gif");
            return;
        }
        canvasRef.current?.toBlob((blob) => {
            if (blob) download(blob, mode === "anaglyph" ? "anaglyph.jpeg" : `anaglyph-ai-${mode}.jpeg`);
        }, "image/jpeg", 0.92);
    };

    return (
        <div>
            <h1>{OUTPUT_NAMES[mode]}</h1>
            <div className="anaglyphEditor">
                <label>
                    Output
                    <select value={mode} onChange={(e) => setMode(e.target.value as OutputMode)}>
                        {(Object.keys(OUTPUT_NAMES) as OutputMode[]).map((m) => (
                            <option key={m} value={m}>{OUTPUT_NAMES[m]}</option>
                        ))}
                    </select>
                </label>
                {mode === "anaglyph" && (
                    <label>
                        Minimise Retinal Rivalry
                        <input type="checkbox" checked={reduceRivalry} onChange={(e) => setReduceRivalry(e.target.checked)} />
                    </label>
                )}
            </div>
            <div className="anaglyphEditor">
                <label>
                    Strength
                    <input type="range" min="0" max="6" step="0.1" value={strength}
                           onChange={(e) => setStrength(parseFloat(e.target.value))} />
                </label>
                <label className="planeSlider">
                    <span>Pop out</span>
                    <input type="range" min="0" max="1" step="0.01" value={plane}
                           aria-label="Depth at screen level"
                           title="Which depth sits at the screen: things nearer than it pop out, things further sink in"
                           onChange={(e) => setPlane(parseFloat(e.target.value))} />
                    <span>Sink in</span>
                </label>
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
                <button className="anaglyphButton" onClick={handleDownload}>Download</button>
            </div>
            <canvas ref={canvasRef} className="anaglyphImage" />
        </div>
    );
}

export default AnaglyphEditor;
