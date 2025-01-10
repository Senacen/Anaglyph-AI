from sched import scheduler

from flask import Flask, jsonify, request, session
from flask_cors import CORS
import uuid
import os
from PIL import Image
import cv2
import time
import numpy as np

from depth_map_generator import depth_map_generator
from anaglyph_generator import anaglyph_generator
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from werkzeug.utils import send_from_directory
app = Flask(__name__)
CORS(app, supports_credentials=True)


load_dotenv()
host = os.getenv("FLASK_HOST")
port = int(os.getenv("FLASK_PORT"))

# Secret key for session management
app.secret_key = 'super secret key'

# Maximum dimension for the image to be processed, will resize the largest dimension to this if larger
MAX_DIMENSION = 2000

# By default, sessions close on the client side as soon as the user's browser is closed or cookies cleared
SESSION_DATA_FOLDER = 'resources/session_data'
os.makedirs(SESSION_DATA_FOLDER, exist_ok=True)

# Previously had a dictionary of session last activity time, but managing concurrency is too hard

ALLOWED_EXTENSIONS = {
    'bmp', 'dib',        # Windows bitmaps
    'jpeg', 'jpg', 'jpe', # JPEG files
    'jp2',               # JPEG 2000 files
    'png',               # Portable Network Graphics
    'webp',              # WebP
    'pbm', 'pgm', 'ppm', 'pxm', 'pnm', # Portable image formats
    'sr', 'ras',         # Sun rastersa
    'tiff', 'tif',      # TIFF files
    'exr',               # OpenEXR Image files
    'hdr', 'pic'        # Radiance HDR
}

# Used to downscale the image before generating the depth map to improve performance and avoid issue with thin images by making it square
# 518x518 is a what it was trained on per the paper
depth_map_resize_dimension = 518

@app.route('/')
def hello_world():  # put application's code here
    return 'Hello World!!'

@app.before_request
def assign_session_id():
    """
    Assigns a session ID to the session object if it does not already exist for the current user
    """
    if 'session_id' not in session:
        session['session_id'] = uuid.uuid4()

# Had some issues with debug mode and app context where it thinks it needs the app context.
# Seems to be sorted after I made the working directory Anaglyph AI and ran the app from there (python backend/app.py)

def clear_old_session_files():
    """
    Clears all sessions that have been inactive for more than 30 minutes. Clears all files that haven't been modified in a day
    """
    current_time = time.time()
    session_files_cleared = 0

    # Delete any session files that are more than a day old
    for filename in os.listdir(SESSION_DATA_FOLDER):
        if current_time - os.path.getmtime(os.path.join(SESSION_DATA_FOLDER, filename)) > 60 * 60 * 24:
            os.remove(os.path.join(SESSION_DATA_FOLDER, filename))
            session_files_cleared += 1

    print(f"Session files cleared: {session_files_cleared}")

clean_up_scheduler = BackgroundScheduler()
clean_up_scheduler.add_job(clear_old_session_files, 'interval', hours=1) # Every hour
clean_up_scheduler.start()
@app.route('/image', methods=['POST'])
def upload_image():
    """
    Uploads an image to the server. Saves it as <session_id>_image.jpg in the SESSION_DATA_FOLDER folder.
    """
    if 'file' not in request.files: # No file part
        return jsonify({'error': 'No file part'}), 400
    image = request.files['file']
    if image.filename == '': # No file selected
        return jsonify({'error': 'No selected file'}), 400
    if image.filename.split('.')[-1].lower() in ALLOWED_EXTENSIONS:
        try:
            pillow_image = Image.open(image)

            # To fix rotation issue with iPhone images
            exif_data = pillow_image._getexif()
            if exif_data is not None:
                orientation = exif_data.get(274)
                if orientation == 3:
                    pillow_image = pillow_image.rotate(180, expand=True)
                elif orientation == 6:
                    pillow_image = pillow_image.rotate(270, expand=True)
                elif orientation == 8:
                    pillow_image = pillow_image.rotate(90, expand=True)

            pillow_image = pillow_image.convert('RGB') # Required for jpg

            if pillow_image.width > MAX_DIMENSION or pillow_image.height > MAX_DIMENSION:
                pillow_image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

            image_name = f"{session['session_id']}_image.jpg"
            image_path = os.path.join(SESSION_DATA_FOLDER, image_name)
            pillow_image.save(image_path, format='JPEG')
            return jsonify({"Success": "Image uploaded successfully"}), 200
        except Exception as e:
            return jsonify({'error': str(e) + " Note: transparent background not allowed"}), 400
    else:
        return jsonify({'error': 'Invalid file type'}), 400


@app.route('/depth-map', methods=['GET'])
def get_depth_map():
    """
    API endpoint to get the depth map for the uploaded image.
    :returns: The path to the depth map coloured for the front end to access
    """
    depth_map_coloured_name = f"{session['session_id']}_depth_map_coloured.jpg"
    depth_map_coloured_path = os.path.join(SESSION_DATA_FOLDER, depth_map_coloured_name)

    # Reprocess every time to ensure the latest image is used (as a change in image will still leave the old depth map)
    process_depth_maps()

    # Using werkzeug's send_from_directory instead of flask, as flask's version for some reason uses the backend as the working directory
    # and that doesn't match with SESSION_DATA_FOLDER or even the os.path.exists check above
    # werkzeug's version uses one directory above which turns out to work.
    # Need to pass extra request.environ tho, as flask's version does that for us
    return send_from_directory(SESSION_DATA_FOLDER, depth_map_coloured_name, request.environ)

def process_depth_maps():
    """
    Processes the image in the session_data folder to create depth maps.
    Saves the coloured depth map for display, and saves the normalised depth map as an .npy file for use in stereo image generation
    """
    try:
        image_name = f"{session['session_id']}_image.jpg"
        image_path = os.path.join(SESSION_DATA_FOLDER, image_name)
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Image not found at path: {image_path}")
        # depth_map = depth_map_generator.generate_depth_map(image)
        # Test downscaling and upscaling performance gain on production server
        # Also, strangely really thin but long images make the depth map generation really slow or crash, so use this
        depth_map = depth_map_generator.generate_depth_map_performant(image, depth_map_resize_dimension, depth_map_resize_dimension)
        depth_map_coloured = depth_map_generator.colour_depth_map(depth_map)
        depth_map_coloured_name = f"{session['session_id']}_depth_map_coloured.jpg"
        depth_map_coloured_path = os.path.join(SESSION_DATA_FOLDER, depth_map_coloured_name)
        cv2.imwrite(depth_map_coloured_path, depth_map_coloured)
        depth_map_name = f"{session['session_id']}_depth_map.npy"
        depth_map_path = os.path.join(SESSION_DATA_FOLDER, depth_map_name)
        np.save(depth_map_path, depth_map)
    except Exception as e:
        print(f"Error processing depth maps: {e}")

@app.route('/anaglyph', methods=['GET'])
def get_anaglyph():
    """
    API endpoint to get the anaglyph for the uploaded image.
    :pop_out: Whether the anaglyph should pop out of the screen (default: false)
    :max_disparity: The maximum disparity for the depth map (default: 25)
    :optimised_RR_anaglyph: Whether to generate an optimised RR anaglyph (default: false)
    :returns: The anaglyph image file
    """
    anaglyph_name = f"{session['session_id']}_anaglyph.jpg"
    anaglyph_path = os.path.join(SESSION_DATA_FOLDER, anaglyph_name)
    left_image_path = os.path.join(SESSION_DATA_FOLDER, f"{session['session_id']}_left_image.jpg")
    right_image_path = os.path.join(SESSION_DATA_FOLDER, f"{session['session_id']}_right_image.jpg")

    try:
        depth_map_name = f"{session['session_id']}_depth_map.npy"
        depth_map_path = os.path.join(SESSION_DATA_FOLDER, depth_map_name)
        depth_map = np.load(depth_map_path)

        image_name = f"{session['session_id']}_image.jpg"
        image_path = os.path.join(SESSION_DATA_FOLDER, image_name)
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Image not found at path: {image_path}")

        pop_out = request.args.get("pop_out", default="false").lower() == "true"
        max_disparity_percentage = float(request.args.get("max_disparity_percentage", default=25))
        left_image, right_image = anaglyph_generator.generate_stereo_images(image, depth_map, pop_out, max_disparity_percentage)

        cv2.imwrite(left_image_path, left_image)
        cv2.imwrite(right_image_path, right_image)

        optimised_RR_anaglyph = request.args.get("optimised_RR_anaglyph", default="false").lower() == "true"
        if optimised_RR_anaglyph:
            anaglyph = anaglyph_generator.generate_optimised_RR_anaglyph(left_image, right_image)
        else:
            anaglyph = anaglyph_generator.generate_pure_anaglyph(left_image, right_image)

        cv2.imwrite(anaglyph_path, anaglyph)

    except Exception as e:
        return jsonify({"Error generating anaglyph": str(e)}), 400

    # Werkzeug's version of send_from_directory
    return send_from_directory(SESSION_DATA_FOLDER, anaglyph_name, request.environ)

if __name__ == '__main__':
    # Don't use 5000, as that's something apple uses. Use 8000 instead
    app.run(debug=True, host=host, port=port)
