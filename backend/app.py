"""
Anaglyph AI backend.

Stateless: the server only runs the depth model. The browser builds the stereo pair,
anaglyph, side-by-side and wiggle views from the image + depth map, so slider changes
never hit the server and no per-user files or sessions are stored.
"""
import io
import os
import re

import cv2
import numpy as np
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.exceptions import RequestEntityTooLarge

from depth_map_generator import depth_map_generator

load_dotenv()
host = os.getenv("FLASK_HOST", "0.0.0.0")
port = int(os.getenv("FLASK_PORT", 8000))

app = Flask(__name__)

# Only our own frontend (and local dev) may call the API from a browser.
# Override with a comma-separated list in CORS_ORIGINS if the domain changes.
_default_origins = [
    re.compile(r"^https://([a-z0-9-]+\.)?anaglyph-ai\.com$"),
    re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"),
]
_env_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
CORS(app, origins=_env_origins or _default_origins)

# Largest side the image is processed at. The client already resizes to this; this is the backstop.
MAX_DIMENSION = 1500
# Reject uploads over 20 MB before reading them, and images over 40 megapixels before decoding them.
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000

# The model was trained at 518x518. Images are resized to this square before inference, which also
# keeps very long thin images from blowing up inference time.
DEPTH_MAP_RESIZE_DIMENSION = 518

ALLOWED_EXTENSIONS = {
    'bmp', 'dib', 'jpeg', 'jpg', 'jpe', 'jp2', 'png', 'webp',
    'pbm', 'pgm', 'ppm', 'pxm', 'pnm', 'sr', 'ras', 'tiff', 'tif', 'gif',
}

RANDOM_IMAGES_FOLDER = 'resources/random_images'
RANDOM_DEPTH_MAPS_FOLDER = 'resources/random_images_depth_maps_greyscale'
num_random_images = len([n for n in os.listdir(RANDOM_IMAGES_FOLDER)
                         if os.path.isfile(os.path.join(RANDOM_IMAGES_FOLDER, n))])


def png_response(array: np.ndarray):
    ok, buffer = cv2.imencode('.png', array)
    if not ok:
        raise RuntimeError("Could not encode PNG")
    return send_file(io.BytesIO(buffer.tobytes()), mimetype='image/png')


@app.errorhandler(RequestEntityTooLarge)
def too_large(_):
    return jsonify({'error': 'Image is too large (max 20 MB)'}), 413


@app.route('/')
def health():
    return 'OK'


@app.route('/depth-map', methods=['POST'])
def depth_map():
    """
    Upload an image (multipart field "file"); returns its depth map as an 8-bit greyscale PNG
    the same size as the (possibly downscaled) image. 255 = closest.
    """
    image = request.files.get('file')
    if image is None or image.filename == '':
        return jsonify({'error': 'No file uploaded'}), 400
    if image.filename.rsplit('.', 1)[-1].lower() not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'Invalid file type'}), 400

    try:
        pillow_image = Image.open(image.stream)
        pillow_image = ImageOps.exif_transpose(pillow_image)  # Phone photos: apply all 8 EXIF orientations
        pillow_image = pillow_image.convert('RGB')
        pillow_image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
    except Image.DecompressionBombError:
        return jsonify({'error': 'Image has too many pixels'}), 400
    except (UnidentifiedImageError, OSError):
        return jsonify({'error': 'Could not read that file as an image'}), 400

    bgr = cv2.cvtColor(np.asarray(pillow_image), cv2.COLOR_RGB2BGR)
    try:
        depth = depth_map_generator.generate_depth_map_performant(bgr, DEPTH_MAP_RESIZE_DIMENSION, DEPTH_MAP_RESIZE_DIMENSION)
    except Exception as e:
        app.logger.exception("Depth map generation failed")
        return jsonify({'error': f'Depth map generation failed: {e}'}), 500

    return png_response((depth * 255).round().astype(np.uint8))


@app.route('/random')
def random_image():
    """Pick a random example image. Returns {"index": n}; fetch the files from the two routes below."""
    return jsonify({'index': int(np.random.randint(0, num_random_images))})


@app.route('/random/<int:index>/image')
def random_image_file(index: int):
    if not 0 <= index < num_random_images:
        return jsonify({'error': 'No such image'}), 404
    return send_file(os.path.abspath(os.path.join(RANDOM_IMAGES_FOLDER, f"image_{index}.jpg")),
                     mimetype='image/jpeg', max_age=86400)


@app.route('/random/<int:index>/depth-map')
def random_depth_map_file(index: int):
    if not 0 <= index < num_random_images:
        return jsonify({'error': 'No such image'}), 404
    return send_file(os.path.abspath(os.path.join(RANDOM_DEPTH_MAPS_FOLDER, f"depth_map_greyscale_{index}.jpg")),
                     mimetype='image/jpeg', max_age=86400)


if __name__ == '__main__':
    # Don't use 5000, as that's something apple uses. Use 8000 instead
    app.run(debug=True, host=host, port=port)
