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
app = Flask(__name__)

# Secret key for session management
app.secret_key = 'super secret key'

# By default, sessions close on the client side as soon as the user's browser is closed or cookies cleared
SESSION_DATA_FOLDER = 'resources/session_data'
os.makedirs(SESSION_DATA_FOLDER, exist_ok=True)
# Dictionary to store the last activity time of each session (session_id: last_activity_time)
# Kept in memory, so will be lost if the server is restarted so also delete session files after a day in case server was restarted
session_last_activity = {}

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

    # Update the last activity time of the session on every request
    session_last_activity[session["session_id"]] = time.time()

@app.route("/heartbeat", methods=['Post'])
def heartbeat():
    """
    Updates the last activity time of the session, used to check if the session is still active
    """
    session_last_activity[session["session_id"]] = time.time()
    return jsonify({"success": "Session active"}), 200

# Only works through curl if don't pass in the session_id, as that would update it
# Actually creates a new session_id for this request
@app.route("/clear-old-sessions", methods=['Post'])
def clear_old_sessions():
    """
    Clears all sessions that have been inactive for more than 30 minutes. Clears all files that haven't been modified in a day
    """
    current_time = time.time()
    sessions_cleared = 0
    print(session_last_activity)
    for session_id in list(session_last_activity.keys()): # Need to make a copy of the keys as we are deleting from the dictionary
        last_activity_time = session_last_activity[session_id]
        if current_time - last_activity_time > 120: # In seconds
            for filename in os.listdir(SESSION_DATA_FOLDER):
                if filename.startswith(str(session_id)):
                    os.remove(os.path.join(SESSION_DATA_FOLDER, filename))
            session_last_activity.pop(session_id)
            sessions_cleared += 1

    # Also delete any session files that are more than a day old
    for filename in os.listdir(SESSION_DATA_FOLDER):
        if time.time() - os.path.getmtime(os.path.join(SESSION_DATA_FOLDER, filename)) > 60 * 60 * 24:
            os.remove(os.path.join(SESSION_DATA_FOLDER, filename))

    print(session_last_activity)
    return jsonify({"success": f"{sessions_cleared} sessions cleared"}), 200

clean_up_scheduler = BackgroundScheduler()
clean_up_scheduler.add_job(clear_old_sessions, 'interval', minutes=1)
clean_up_scheduler.start()
@app.route('/image', methods=['POST'])
def upload_image():
    """
    Uploads an image to the server. Saves it as <session_id>_image.jpg in the session_images folder.
    """
    if 'file' not in request.files: # No file part
        return jsonify({'error': 'No file part'}), 400
    image = request.files['file']
    if image.filename == '': # No file selected
        return jsonify({'error': 'No selected file'}), 400
    if image.filename.split('.')[-1].lower() in ALLOWED_EXTENSIONS:
        try:
            pillow_image = Image.open(image)
            pillow_image.convert('RGB') # Required for jpg
            image_name = f"{session['session_id']}_image.jpg"
            image_path = os.path.join(SESSION_DATA_FOLDER, image_name)
            pillow_image.save(image_path, format='JPEG')
            return jsonify({"Success": "Image uploaded successfully"}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 400
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

    return jsonify({"depth_map_path": depth_map_coloured_path}), 200

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
        depth_map = depth_map_generator.generate_normalised_depth_map(image)
        # Test downscaling and upscaling performance gain on production server
        # depth_map = depth_map_generator.generate_normalised_depth_map_performant(image, 256, 256)
        depth_map_scaled = (depth_map * 255).astype(np.uint8)
        depth_map_coloured = cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)
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
    API endpoint to get the anaglyph and stereo images for the uploaded image.
    :returns: The path to the anaglyph and left and right images for the front end to access
    """
    anaglyph_name = f"{session['session_id']}_anaglyph.jpg"
    anaglyph_path = os.path.join(SESSION_DATA_FOLDER, anaglyph_name)
    left_image_path = os.path.join(SESSION_DATA_FOLDER, f"{session['session_id']}_left_image.jpg")
    right_image_path = os.path.join(SESSION_DATA_FOLDER, f"{session['session_id']}_right_image.jpg")

    try:
        depth_map_normalised_name = f"{session['session_id']}_depth_map.npy"
        depth_map_normalised_path = os.path.join(SESSION_DATA_FOLDER, depth_map_normalised_name)
        depth_map_normalised = np.load(depth_map_normalised_path)

        image_name = f"{session['session_id']}_image.jpg"
        image_path = os.path.join(SESSION_DATA_FOLDER, image_name)
        image = cv2.imread(image_path)
        if image is None:
            raise FileNotFoundError(f"Image not found at path: {image_path}")

        pop_out = request.args.get("pop_out", default="false").lower() == "true"
        max_disparity = float(request.args.get("max_disparity", default=25))
        left_image, right_image = anaglyph_generator.generate_stereo_images(image, depth_map_normalised, pop_out, max_disparity)

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

    return jsonify({"anaglyph_path": anaglyph_path, "left_image_path": left_image_path, "right_image_path": right_image_path}), 200

if __name__ == '__main__':
    app.run(debug=True)
