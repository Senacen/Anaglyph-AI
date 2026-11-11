import os
import threading
import time

import cv2
import numpy as np
import onnxruntime as ort

# Depth Anything V2 Small, exported to ONNX by tools/export_onnx.py. The int8-quantised model is the default
# (smaller and faster on CPU); set DEPTH_MODEL=fp32 to use the full-precision export instead.
MODEL_FILES = {
    "int8": "ai_models/checkpoints/depth_anything_v2_vits_int8.onnx",
    "fp32": "ai_models/checkpoints/depth_anything_v2_vits.onnx",
}
MODEL_INPUT_SIZE = 518  # the model was exported for a fixed 518x518 input
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# One model instance shared by all gunicorn threads (threads share memory, worker processes would not).
# The lock runs one inference at a time so concurrent uploads don't multiply RAM use or fight over CPU cores;
# other requests (example images, health checks) are still served by the other threads meanwhile.
_inference_lock = threading.Lock()


# Singleton
class DepthMapGenerator:
    _instance = None
    session = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(DepthMapGenerator, cls).__new__(cls)
        return cls._instance

    def __init__(self, precision=None):
        if self.session is None:  # Required as __init__ is called on every DepthMapGenerator()
            self.load_model(precision or os.getenv("DEPTH_MODEL", "int8"))

    def load_model(self, precision: str):
        """
        Load the ONNX model.
        :param precision: "int8" (default) or "fp32".
        """
        start_time = time.time()
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.getenv("INFERENCE_THREADS", os.cpu_count() or 4))
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(MODEL_FILES[precision], options, providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        print(f"Loaded {precision} depth model in {time.time() - start_time:.2f} seconds")

    def generate_depth_map(self, image: np.ndarray) -> np.ndarray:
        """
        Generate a normalised (0,1) depth map from a 518x518 BGR image.
        Same preprocessing as Depth Anything V2's infer_image: RGB, 0-1, ImageNet normalisation, CHW.
        :param image: Image to generate a depth map from (already resized to the model input size).
        :return: Depth map with largest value as closest.
        """
        if image.shape[:2] != (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE):
            image = cv2.resize(image, (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE), interpolation=cv2.INTER_CUBIC)
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        tensor = ((rgb - IMAGENET_MEAN) / IMAGENET_STD).transpose(2, 0, 1)[np.newaxis]
        with _inference_lock:
            depth_map = self.session.run(None, {self.input_name: np.ascontiguousarray(tensor)})[0][0]
        return self.normalise(depth_map)

    def normalise(self, depth_map: np.ndarray) -> np.ndarray:
        """
        Normalise the depth map to the range [0, 1].
        :param depth_map: The depth map to normalise.
        :return: Normalised depth map, with direction flipped so 0 is closest and 1 is furthest.
        """
        # 0 is closest, 1 is furthest
        depth_range = np.max(depth_map) - np.min(depth_map)
        if depth_range == 0:  # Completely flat prediction (e.g. a blank image): avoid dividing by zero
            return np.zeros_like(depth_map)
        return (depth_map - np.min(depth_map)) / depth_range

    def downscale_image(self, image:np.ndarray, width:int, height:int):
        """
        Downscale the image to the specified width and height.
        :param image: Image to downscale.
        :param width: Desired width for the image.
        :param height: Desired height for the image.
        :return: Downscaled image.
        """
        return cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA)

    def upscale_depth_map(self, depth_map:np.ndarray, width:int, height:int):
        """
        Upscale the normalised depth map to the specified width and height.
        :param depth_map: Normalised depth map to upscale.
        :param width: Desired width for the depth map.
        :param height: Desired height for the depth map.
        :return: Upscaled normalised depth map.
        """
        # Convert to image first to use image resizing
        depth_map_scaled = (depth_map * 255).astype(np.uint8)

        # Use inter_cubic as better result, even though slower, as only slower than inter_linear by about 2ms
        depth_map_upscaled = cv2.resize(depth_map_scaled, (width, height), interpolation=cv2.INTER_CUBIC)/ 255

        return depth_map_upscaled
    
    def generate_depth_map_performant(self, image: np.ndarray, intermediateWidth:int, intermediateHeight:int) -> np.ndarray:
        """
        Generate a depth map from an image.
        :param image: Image to generate a depth map from.
        :param intermediateWidth: Width to downscale the image to before generating the depth map.
        :param intermediateHeight: Height to downscale the image to before generating the depth map.
        :return: Depth map with largest value as closest.
        """
        start_time = time.time()
        image_downscaled = self.downscale_image(image, intermediateWidth, intermediateHeight)
        depth_map_downscaled = self.generate_depth_map(image_downscaled)
        depth_map_upscaled = self.upscale_depth_map(depth_map_downscaled, image.shape[1], image.shape[0])
        end_time = time.time()
        elapsed_time = end_time - start_time
        print(f"Elapsed time for depth map generation (performant): {elapsed_time:.4f} seconds")
        return depth_map_upscaled

    def colour_depth_map(self, depth_map: np.ndarray) -> np.ndarray:
        """
        Colour the depth map using the jet colormap.
        :param depth_map: Depth map to colour.
        :return: Coloured depth map.
        """
        depth_map_scaled = (depth_map * 255).astype(np.uint8)
        return cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)

    def blur_depth_map(self, depth_map: np.ndarray, kernel_width: int) -> np.ndarray:
        """
        Blur the depth map horizontally to make edges look nicer.
        :param depth_map: Depth map to blur.
        :param kernel_width: Horizontal length of the kernel.
        :return: Blurred depth map.
        """

        # Ensure the depth map is in the range [0, 255] for blurring
        depth_map_scaled = (depth_map * 255).astype(np.uint8)

        # Apply horizontal blur
        blurred_depth_map_scaled = cv2.blur(depth_map_scaled, (kernel_width, 1))


        # Normalize back to the range [0, 1]
        blurred_depth_map = blurred_depth_map_scaled / 255.0

        return blurred_depth_map

depth_map_generator = DepthMapGenerator()

if __name__ == '__main__':

    start_time = time.time()
    path_to_file = "resources/images/amanda.jpeg"
    image = cv2.imread(path_to_file)
    depth_map_full = depth_map_generator.generate_depth_map(image)


    depth_map_colored = depth_map_generator.colour_depth_map(depth_map_full)
    # End time
    end_time = time.time()
    # Calculate the time taken
    elapsed_time = end_time - start_time
    print(f"Elapsed time for depth map: {elapsed_time:.4f} seconds")
    cv2.imshow('Depth Map Full', depth_map_colored)
    cv2.imshow('Original Image', image)



    # Test downscaling and upscaling
    start_time = time.time()
    depth_map_upscaled = depth_map_generator.generate_depth_map_performant(image, 100, 100)
    # Scale to 0-255
    depth_map_upscaled_scaled = (depth_map_upscaled * 255).astype(np.uint8)
    # Apply a colormap
    depth_map_colored_upscaled = depth_map_generator.colour_depth_map(depth_map_upscaled)
    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"Elapsed time for depth map downscaling and upscaling: {elapsed_time:.4f}")
    cv2.imshow('Depth Map Downscaled Upscaled', depth_map_colored_upscaled)


    cv2.waitKey(0)  
    cv2.destroyAllWindows()

