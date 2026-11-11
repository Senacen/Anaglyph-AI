// Client-side stereo engine: turns an image + depth map into left/right eye views and the
// various output formats. Ported from the backend's anaglyph_generator.py so slider changes
// are instant and never hit the server.

export interface Source {
    width: number;
    height: number;
    rgba: Uint8ClampedArray; // the image, RGBA
    depth: Float32Array; // 0 = furthest, 1 = closest
    imageUrl: string; // for display
    depthColourUrl: string; // jet-coloured depth map, for display
}

export interface Eyes {
    width: number;
    height: number;
    left: Uint8ClampedArray;
    right: Uint8ClampedArray;
}

export type OutputMode = "anaglyph" | "sbs-parallel" | "sbs-cross" | "wiggle";

/** Horizontal box blur (like cv2.blur(depth, (k, 1))) to soften depth edges and reduce tearing. */
export function smoothDepth(depth: Float32Array, width: number, height: number, kernel: number): Float32Array {
    if (kernel <= 1) return depth;
    const out = new Float32Array(depth.length);
    const half = Math.floor(kernel / 2);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        let sum = 0;
        // Edge pixels are clamped (repeated) beyond the borders
        for (let k = -half; k <= half; k++) sum += depth[row + Math.min(width - 1, Math.max(0, k))];
        for (let x = 0; x < width; x++) {
            out[row + x] = sum / kernel;
            const add = Math.min(width - 1, x + half + 1);
            const remove = Math.max(0, x - half);
            sum += depth[row + add] - depth[row + remove];
        }
    }
    return out;
}

/**
 * Build one eye view by shifting each pixel horizontally by its depth relative to the zero-parallax plane.
 * shift = trunc(maxShift * (depth - plane)). plane = 0 pops everything out of the screen, 1 sinks it all in.
 * Where two pixels land on the same spot the closer one wins; gaps are filled from the further side,
 * since a gap is background revealed from behind a closer object.
 */
function makeEye(src: Source, depth: Float32Array, maxShift: number, plane: number, isLeft: boolean): Uint8ClampedArray {
    const { width, height, rgba } = src;
    const out = new Uint8ClampedArray(width * height * 4);
    const from = new Int32Array(width); // source x for each output x in this row, -1 = hole

    for (let y = 0; y < height; y++) {
        const row = y * width;
        from.fill(-1);
        if (isLeft) {
            // Left eye: closer pixels move right. Iterate right-to-left so the leftmost (closer) source is written last and wins.
            for (let x = width - 1; x >= 0; x--) {
                const dest = x + Math.trunc(maxShift * (depth[row + x] - plane));
                if (dest >= 0 && dest < width) from[dest] = x;
            }
        } else {
            // Right eye: closer pixels move left. Iterate left-to-right so the rightmost (closer) source wins.
            for (let x = 0; x < width; x++) {
                const dest = x - Math.trunc(maxShift * (depth[row + x] - plane));
                if (dest >= 0 && dest < width) from[dest] = x;
            }
        }

        // Fill holes: each run of -1 takes the pixel on whichever side of it is further away
        let x = 0;
        while (x < width) {
            if (from[x] !== -1) { x++; continue; }
            const start = x;
            while (x < width && from[x] === -1) x++;
            const leftSrc = start > 0 ? from[start - 1] : -1;
            const rightSrc = x < width ? from[x] : -1;
            let fill: number;
            if (leftSrc === -1) fill = rightSrc;
            else if (rightSrc === -1) fill = leftSrc;
            else fill = depth[row + leftSrc] <= depth[row + rightSrc] ? leftSrc : rightSrc;
            for (let i = start; i < x; i++) from[i] = fill;
        }

        for (let i = 0; i < width; i++) {
            const o = (row + i) * 4;
            const s = from[i];
            if (s === -1) { out[o + 3] = 255; continue; } // whole row empty (can't really happen): black
            const si = (row + s) * 4;
            out[o] = rgba[si]; out[o + 1] = rgba[si + 1]; out[o + 2] = rgba[si + 2]; out[o + 3] = 255;
        }
    }
    return out;
}

/**
 * @param strength maximum disparity as a percentage of image width (same meaning as the old backend parameter)
 * @param plane zero-parallax plane, 0 (pop out) .. 1 (sink in)
 */
export function makeEyes(src: Source, depth: Float32Array, strength: number, plane: number): Eyes {
    const maxShift = (strength / 100) * src.width / 2; // each eye moves half of the total disparity
    return {
        width: src.width,
        height: src.height,
        left: makeEye(src, depth, maxShift, plane, true),
        right: makeEye(src, depth, maxShift, plane, false),
    };
}

// Red-cyan filter optimised to reduce retinal rivalry, per
// https://cybereality.com/rendepth-red-cyan-anaglyph-filter-optimized-for-stereoscopic-3d-on-lcd-monitors/
// Rows are output R, G, B; columns input R, G, B.
const RR_LEFT = [
    [0.4561, 0.500484, 0.176381],
    [-0.400822, -0.0378246, -0.0157589],
    [-0.0152161, -0.0205971, -0.00546856],
];
const RR_RIGHT = [
    [-0.0434706, -0.0879388, -0.00155529],
    [0.378476, 0.73364, -0.0184503],
    [-0.0721527, -0.112961, 1.2264],
];

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * How the two eye views are mixed into red and cyan.
 * - pure: red channel of the left eye, green + blue of the right. Full colour, most retinal rivalry.
 * - half: left eye as greyscale in red. Less rivalry on saturated reds, slightly less colour.
 * - dubois: least-squares optimised matrices (Sanders & McAllister, after Dubois). Least rivalry, muted colour.
 */
export type ColourMethod = "pure" | "half" | "dubois";

/**
 * Glasses leak: how much of the *other* colour each lens lets through (0 = perfect filter).
 * red: fraction of the screen's green that gets through the red (left) lens -> right image ghosts in the left eye.
 * cyan: fraction of the screen's red that gets through the cyan (right) lens -> left image ghosts in the right eye.
 */
export interface Leakage {
    red: number;
    cyan: number;
}

// Ghost cancellation must happen in linear light (that's how light adds up at the lens), so convert sRGB <-> linear.
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
    const c = i / 255;
    SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LINEAR_STEPS = 4096;
const LINEAR_TO_SRGB = new Uint8ClampedArray(LINEAR_STEPS + 1);
for (let i = 0; i <= LINEAR_STEPS; i++) {
    const c = i / LINEAR_STEPS;
    LINEAR_TO_SRGB[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}
const toSrgb = (linear: number) => LINEAR_TO_SRGB[Math.round((linear < 0 ? 0 : linear > 1 ? 1 : linear) * LINEAR_STEPS)];

/**
 * Pre-compensate one red/cyan pixel (sRGB 0-255, written into d at i) so that what leaks through each lens
 * is cancelled. Through the red lens the eye sees r + k*g; so we output r' = k + (1-k)r - k*g, which makes
 * r' + k*g = k + (1-k)r: the right image's green no longer shows, at the cost of slightly raised blacks.
 * Likewise for the cyan lens with the left image's red.
 */
function cancelGhosts(d: Uint8ClampedArray, i: number, leak: Leakage) {
    const r = SRGB_TO_LINEAR[d[i]], g = SRGB_TO_LINEAR[d[i + 1]], b = SRGB_TO_LINEAR[d[i + 2]];
    const kr = leak.red, kc = leak.cyan;
    d[i] = toSrgb(kr + (1 - kr) * r - kr * g);
    d[i + 1] = toSrgb(kc + (1 - kc) * g - kc * r);
    d[i + 2] = toSrgb(kc + (1 - kc) * b - kc * r);
}

export function anaglyph(eyes: Eyes, method: ColourMethod, leak: Leakage = { red: 0, cyan: 0 }): ImageData {
    const { width, height, left, right } = eyes;
    const out = new ImageData(width, height);
    const d = out.data;
    const compensate = leak.red > 0 || leak.cyan > 0;
    for (let i = 0; i < d.length; i += 4) {
        if (method === "pure") {
            d[i] = left[i]; // red from the left eye
            d[i + 1] = right[i + 1]; // green + blue (cyan) from the right eye
            d[i + 2] = right[i + 2];
        } else if (method === "half") {
            d[i] = 0.299 * left[i] + 0.587 * left[i + 1] + 0.114 * left[i + 2]; // left eye brightness in red
            d[i + 1] = right[i + 1];
            d[i + 2] = right[i + 2];
        } else {
            const lr = left[i], lg = left[i + 1], lb = left[i + 2];
            const rr = right[i], rg = right[i + 1], rb = right[i + 2];
            for (let c = 0; c < 3; c++) {
                // Each eye's contribution is clamped separately (matches the original cv2.transform on uint8)
                const l = clamp255(RR_LEFT[c][0] * lr + RR_LEFT[c][1] * lg + RR_LEFT[c][2] * lb);
                const r = clamp255(RR_RIGHT[c][0] * rr + RR_RIGHT[c][1] * rg + RR_RIGHT[c][2] * rb);
                d[i + c] = clamp255(l + r);
            }
        }
        if (compensate) cancelGhosts(d, i, leak);
        d[i + 3] = 255;
    }
    return out;
}

/**
 * Test card for tuning ghost cancellation to a pair of glasses. One half is for each lens: a word is drawn
 * only in the colour that lens should block, on a mid-grey background in the colour it passes.
 * Looking through that lens alone, the word is visible only because of leakage; the user raises the slider
 * until it disappears. The card goes through the same cancelGhosts as real images.
 */
export function glassesTestCard(width: number, height: number, leak: Leakage): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const half = width / 2;
    ctx.font = `bold ${Math.round(height * 0.32)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Left half, red lens: grey red background (the left eye's own content), word in green+blue (right eye only)
    ctx.fillStyle = "rgb(128,0,0)";
    ctx.fillRect(0, 0, half, height);
    ctx.fillStyle = "rgb(128,255,255)";
    ctx.fillText("3D", half / 2, height / 2);
    // Right half, cyan lens: grey cyan background, word in red (left eye only)
    ctx.fillStyle = "rgb(0,128,128)";
    ctx.fillRect(half, 0, half, height);
    ctx.fillStyle = "rgb(255,128,128)";
    ctx.fillText("3D", half + half / 2, height / 2);
    const data = ctx.getImageData(0, 0, width, height);
    if (leak.red > 0 || leak.cyan > 0) {
        for (let i = 0; i < data.data.length; i += 4) cancelGhosts(data.data, i, leak);
    }
    return data;
}

/** Side by side. Parallel: left eye on the left. Cross-eye: swapped. */
export function sideBySide(eyes: Eyes, crossEye: boolean): ImageData {
    const { width, height } = eyes;
    const [first, second] = crossEye ? [eyes.right, eyes.left] : [eyes.left, eyes.right];
    const out = new ImageData(width * 2, height);
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
        out.data.set(first.subarray(y * rowBytes, (y + 1) * rowBytes), y * rowBytes * 2);
        out.data.set(second.subarray(y * rowBytes, (y + 1) * rowBytes), y * rowBytes * 2 + rowBytes);
    }
    return out;
}

export function eyeImage(eyes: Eyes, which: "left" | "right"): ImageData {
    return new ImageData(new Uint8ClampedArray(which === "left" ? eyes.left : eyes.right), eyes.width, eyes.height);
}

/** Jet colour map (blue = far, red = near), close to cv2.COLORMAP_JET. */
export function colourDepth(depth: Float32Array, width: number, height: number): ImageData {
    const out = new ImageData(width, height);
    const d = out.data;
    for (let i = 0; i < depth.length; i++) {
        const t = depth[i];
        d[i * 4] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3)));
        d[i * 4 + 1] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2)));
        d[i * 4 + 2] = 255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1)));
        d[i * 4 + 3] = 255;
    }
    return out;
}
