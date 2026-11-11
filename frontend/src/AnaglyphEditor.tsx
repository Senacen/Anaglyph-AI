import { useEffect, useMemo, useRef, useState } from "react";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import "./styles/AnaglyphEditor.css";
import { anaglyph, ColourMethod, Eyes, eyeImage, glassesTestCard, Leakage, makeEyes, OutputMode, sideBySide, Source } from "./stereo";

const WIGGLE_INTERVAL_MS = 130;
const WIGGLE_GIF_MAX_DIMENSION = 800; // keep downloaded GIFs a sensible size

const OUTPUT_NAMES: Record<OutputMode, string> = {
    "anaglyph": "Red–cyan anaglyph",
    "sbs-parallel": "Side by side (parallel)",
    "sbs-cross": "Side by side (cross-eye)",
    "wiggle": "Wiggle",
};

const COLOUR_METHOD_NAMES: Record<ColourMethod, string> = {
    "pure": "Pure (full colour)",
    "half": "Half colour",
    "dubois": "Dubois (least rivalry)",
};

// Per-viewer preferences (their glasses don't change between visits). Storage may be unavailable: fall back to defaults.
function loadSetting<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}
function saveSetting(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
}

function GlassesTuning({ leak, setLeak }: { leak: Leakage; setLeak: (l: Leakage) => void }) {
    const cardRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = cardRef.current;
        if (!canvas) return;
        const card = glassesTestCard(640, 200, leak);
        canvas.width = card.width;
        canvas.height = card.height;
        canvas.getContext("2d")!.putImageData(card, 0, 0);
    }, [leak]);
    return (
        <div className="glassesTuning">
            <p>
                Put your glasses on. <b>Close your right eye</b> and move the red slider until the “3D” on the
                left disappears. Then <b>close your left eye</b> and move the cyan slider until the “3D” on the right
                disappears. Saved on this device.
            </p>
            <canvas ref={cardRef} className="testCard" />
            <div className="anaglyphEditor">
                <label>
                    Red lens
                    <input type="range" min="0" max="0.5" step="0.005" value={leak.red}
                           onChange={(e) => setLeak({ ...leak, red: parseFloat(e.target.value) })} />
                </label>
                <label>
                    Cyan lens
                    <input type="range" min="0" max="0.5" step="0.005" value={leak.cyan}
                           onChange={(e) => setLeak({ ...leak, cyan: parseFloat(e.target.value) })} />
                </label>
                <button className="linkButton" onClick={() => setLeak({ red: 0, cyan: 0 })}>Reset</button>
            </div>
        </div>
    );
}

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
    const [colourMethod, setColourMethodState] = useState<ColourMethod>(() => loadSetting("colourMethod", "pure"));
    const [leak, setLeakState] = useState<Leakage>(() => loadSetting("glassesLeakage", { red: 0, cyan: 0 }));
    const [tuning, setTuning] = useState(false);
    const setColourMethod = (m: ColourMethod) => { setColourMethodState(m); saveSetting("colourMethod", m); };
    const setLeak = (l: Leakage) => { setLeakState(l); saveSetting("glassesLeakage", l); };
    const [strength, setStrength] = useState(2); // max disparity, % of image width
    const [plane, setPlane] = useState(1); // zero-parallax plane: 0 = everything pops out, 1 = everything sinks in

    // Recomputed live as the sliders move (all in the browser, no server round trip)
    const eyes = useMemo(() => makeEyes(source, source.depth, strength, plane), [source, strength, plane]);

    const output = useMemo<ImageData | null>(() => {
        if (mode === "anaglyph") return anaglyph(eyes, colourMethod, leak);
        if (mode === "sbs-parallel") return sideBySide(eyes, false);
        if (mode === "sbs-cross") return sideBySide(eyes, true);
        return null; // wiggle is animated below
    }, [eyes, mode, colourMethod, leak]);

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
                    <>
                        <label>
                            Colours
                            <select value={colourMethod} onChange={(e) => setColourMethod(e.target.value as ColourMethod)}>
                                {(Object.keys(COLOUR_METHOD_NAMES) as ColourMethod[]).map((m) => (
                                    <option key={m} value={m}>{COLOUR_METHOD_NAMES[m]}</option>
                                ))}
                            </select>
                        </label>
                        <button className="linkButton" onClick={() => setTuning(!tuning)}>
                            {tuning ? "Done tuning" : leak.red || leak.cyan ? "Glasses tuned ✓" : "Tune to my glasses"}
                        </button>
                    </>
                )}
            </div>
            {mode === "anaglyph" && tuning && <GlassesTuning leak={leak} setLeak={setLeak} />}
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
