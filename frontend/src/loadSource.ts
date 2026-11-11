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

function imageDataUrl(data: ImageData): Promise<string> {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    canvas.getContext("2d")!.putImageData(data, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(URL.createObjectURL(b!)), "image/jpeg", 0.9));
}

async function buildSource(image: HTMLImageElement, depthImage: HTMLImageElement, imageUrl: string, smoothing: number): Promise<Source> {
    const [width, height] = fitWithin(image.naturalWidth, image.naturalHeight);
    const rgba = pixels(image, width, height);
    // Depth map is drawn at the image's size, so it lines up even if the server returned a different size
    const depthPixels = pixels(depthImage, width, height);
    let depth = new Float32Array(width * height);
    for (let i = 0; i < depth.length; i++) depth[i] = depthPixels[i * 4] / 255;
    depth = smoothDepth(depth, width, height, smoothing);
    return {
        width, height, rgba, depth, imageUrl,
        depthColourUrl: await imageDataUrl(colourDepth(depth, width, height)),
    };
}

/** Resize a user's image in the browser, send it for a depth map, and build the Source. */
export async function sourceFromFile(file: Blob): Promise<Source> {
    if (!file.type.startsWith("image/")) throw new Error("That file isn't an image");
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
    const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/jpeg", 0.92));
    const imageUrl = URL.createObjectURL(jpeg);
    const resized = await loadImage(imageUrl);

    const form = new FormData();
    form.append("file", jpeg, "image.jpg");
    const response = await api("/depth-map", { method: "POST", body: form });
    if (!response.ok) throw new Error(await errorMessage(response));
    const depthUrl = URL.createObjectURL(await response.blob());
    try {
        return await buildSource(resized, await loadImage(depthUrl), imageUrl, UPLOAD_DEPTH_SMOOTHING);
    } finally {
        URL.revokeObjectURL(depthUrl);
    }
}

/** Pick a random example image with its precomputed depth map. */
export async function randomSource(): Promise<Source> {
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
    try {
        const [image, depthImage] = await Promise.all([loadImage(imageUrl), loadImage(depthUrl)]);
        return await buildSource(image, depthImage, imageUrl, 1);
    } finally {
        URL.revokeObjectURL(depthUrl);
    }
}
