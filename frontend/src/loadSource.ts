import { colourDepth, smoothDepth, Source } from "./stereo";

const apiUrl = import.meta.env.VITE_FLASK_BACKEND_API_URL;
const maxDimension = Number(import.meta.env.VITE_MAX_DIMENSION) || 1500;

// The app itself uses no cookies, but Cloudflare's bot check sets a clearance cookie for *.anaglyph-ai.com.
// It must be sent with API calls, otherwise Cloudflare challenges them and the browser reports "Load failed".
const api = (path: string, init: RequestInit = {}) => fetch(`${apiUrl}${path}`, { ...init, credentials: "include" });

// Uploaded images get their depth edges softened (as the backend used to); the example images'
// precomputed depth maps were made without this, so they are left as they are.
const UPLOAD_DEPTH_SMOOTHING = 15;

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not read that image"));
        image.src = url;
    });
}

/** Draw an image at the given size and return its pixels. */
function pixels(image: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
}

function fitWithin(width: number, height: number): [number, number] {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    return [Math.round(width * scale), Math.round(height * scale)];
}

async function errorMessage(response: Response): Promise<string> {
    try {
        const body = await response.json();
        if (body?.error) return body.error;
    } catch { /* not JSON */ }
    return `Server error (${response.status})`;
}

/**
 * Encode a canvas as JPEG. Uses the synchronous toDataURL: in some browsers the async toBlob callback is
 * delayed by ~1 s even though the encode itself takes a few milliseconds.
 */
export function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Blob {
    const base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "image/jpeg" });
}

function imageDataUrl(data: ImageData): string {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d")!.putImageData(data, 0, 0);
    return URL.createObjectURL(encodeJpeg(canvas, 0.9));
}

/** How long each stage of loading took, in milliseconds (shown under the images). */
export interface Timings {
    resize?: number; // browser: decode + shrink + JPEG-encode the photo
    network?: number; // upload + download (request time minus server time)
    server?: number; // backend total, from the Server-Timing header
    model?: number; // backend depth model only
    prepare?: number; // browser: decode depth map, smooth, colour
}

/** Progress updates while loading, so the UI can show the photo straight away and what's happening. */
export interface Progress {
    status: string;
    previewUrl?: string;
}
type OnProgress = (progress: Progress) => void;

function serverTiming(response: Response, name: string): number | undefined {
    const header = response.headers.get("Server-Timing") ?? "";
    const match = header.match(new RegExp(`${name};dur=([\\d.]+)`));
    return match ? parseFloat(match[1]) : undefined;
}

async function buildSource(image: HTMLImageElement, depthImage: HTMLImageElement, imageUrl: string,
                           smoothing: number, timings: Timings): Promise<Source> {
    const start = performance.now();
    const [width, height] = fitWithin(image.naturalWidth, image.naturalHeight);
    const rgba = pixels(image, width, height);
    // Depth map is drawn at the image's size, so it lines up even if the server returned a different size
    const depthPixels = pixels(depthImage, width, height);
    const rawDepth = new Float32Array(width * height);
    for (let i = 0; i < rawDepth.length; i++) rawDepth[i] = depthPixels[i * 4] / 255;
    // The preview shows the depth map as the model made it; the smoothed copy is only used to build the
    // stereo views (it softens depth edges so they tear less, but looks blurry if displayed)
    const depthColourUrl = imageDataUrl(colourDepth(rawDepth, width, height));
    const depth = smoothDepth(rawDepth, width, height, smoothing);
    timings.prepare = performance.now() - start;
    return { width, height, rgba, depth, imageUrl, depthColourUrl, timings };
}

/** Resize a user's image in the browser, send it for a depth map, and build the Source. */
export async function sourceFromFile(file: Blob, onProgress: OnProgress): Promise<Source> {
    if (!file.type.startsWith("image/")) throw new Error("That file isn't an image");
    const timings: Timings = {};
    let start = performance.now();
    onProgress({ status: "Preparing photo…" });
    const originalUrl = URL.createObjectURL(file);
    let image: HTMLImageElement;
    try {
        image = await loadImage(originalUrl); // browsers apply the photo's EXIF rotation here
    } finally {
        URL.revokeObjectURL(originalUrl);
    }

    // Resize client side to save bandwidth; this exact JPEG is what we show and what the depth map is made from
    const [width, height] = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    const jpeg = encodeJpeg(canvas, 0.92);
    const imageUrl = URL.createObjectURL(jpeg);
    const resized = await loadImage(imageUrl);
    timings.resize = performance.now() - start;
    onProgress({ status: "Estimating depth…", previewUrl: imageUrl });

    const form = new FormData();
    form.append("file", jpeg, "image.jpg");
    start = performance.now();
    const response = await api("/depth-map", { method: "POST", body: form });
    if (!response.ok) throw new Error(await errorMessage(response));
    const depthBlob = await response.blob();
    const requestMs = performance.now() - start;
    timings.server = serverTiming(response, "total");
    timings.model = serverTiming(response, "model");
    timings.network = timings.server !== undefined ? Math.max(0, requestMs - timings.server) : requestMs;
    onProgress({ status: "Building 3D…", previewUrl: imageUrl });

    const depthUrl = URL.createObjectURL(depthBlob);
    try {
        return await buildSource(resized, await loadImage(depthUrl), imageUrl, UPLOAD_DEPTH_SMOOTHING, timings);
    } finally {
        URL.revokeObjectURL(depthUrl);
    }
}

/** Pick a random example image with its precomputed depth map. */
export async function randomSource(onProgress: OnProgress): Promise<Source> {
    const timings: Timings = {};
    onProgress({ status: "Fetching example…" });
    const start = performance.now();
    const pick = await api("/random");
    if (!pick.ok) throw new Error(await errorMessage(pick));
    const { index } = await pick.json();
    const [imageResponse, depthResponse] = await Promise.all([
        api(`/random/${index}/image`),
        api(`/random/${index}/depth-map`),
    ]);
    if (!imageResponse.ok) throw new Error(await errorMessage(imageResponse));
    if (!depthResponse.ok) throw new Error(await errorMessage(depthResponse));
    const imageUrl = URL.createObjectURL(await imageResponse.blob());
    const depthUrl = URL.createObjectURL(await depthResponse.blob());
    timings.network = performance.now() - start; // precomputed depth map: no model run
    onProgress({ status: "Building 3D…", previewUrl: imageUrl });
    try {
        const [image, depthImage] = await Promise.all([loadImage(imageUrl), loadImage(depthUrl)]);
        return await buildSource(image, depthImage, imageUrl, 1, timings);
    } finally {
        URL.revokeObjectURL(depthUrl);
    }
}
