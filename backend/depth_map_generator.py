import time

start_import_time = time.time()
import cv2
import torch
import numpy as np
from ai_models.Depth_Anything_V2.depth_anything_v2.dpt import DepthAnythingV2
# Had to rename Depth-Anything-V2 to Depth_Anything_V2 as hyphens are not allowed in module names
end_import_time = time.time()
elapsed_import_time = end_import_time - start_import_time
print(f"Elapsed time for imports: {elapsed_import_time:.4f} seconds")

# Singleton
class DepthMapGenerator:
    _instance = None
    model = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(DepthMapGenerator, cls).__new__(cls)
        return cls._instance

    def __init__(self, encoder="vits"): # or 'vitl', 'vits', 'vitb', 'vitg'
        if self.model is None: # Required as __init__ is called
            self.load_model(encoder)

    def load_model(self, encoder):
        """
        Load the pre-trained model.
        :param encoder: The version of the model to load. Options: 'vits', 'vitb', 'vitl', 'vitg'.
        """
        print("Loading model")
        DEVICE = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'

        model_configs = {
            'vits': {'encoder': 'vits', 'features': 64, 'out_channels': [48, 96, 192, 384]},
            'vitb': {'encoder': 'vitb', 'features': 128, 'out_channels': [96, 192, 384, 768]},
            'vitl': {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
            'vitg': {'encoder': 'vitg', 'features': 384, 'out_channels': [1536, 1536, 1536, 1536]}
        }

        self.model = DepthAnythingV2(**model_configs[encoder])
        self.model.load_state_dict(torch.load(f'ai_models/checkpoints/depth_anything_v2_{encoder}.pth', map_location='cpu'))
        self.model = self.model.to(DEVICE).eval()
        print("Loaded model")

    def generate_depth_map(self, image: np.ndarray) -> np.ndarray:
        """
        Generate a normalised (0,1) depth map from an image.
        :param image: Image to generate a depth map from.
        :return: Depth map with largest value as closest.
        """
        return self.normalise(self.model.infer_image(image))  # HxW raw depth map in numpy, normalises to 0-1

    def normalise(self, depth_map: np.ndarray) -> np.ndarray:
        """
        Normalise the depth map to the range [0, 1].
        :param depth_map: The depth map to normalise.
        :return: Normalised depth map, with direction flipped so 0 is closest and 1 is furthest.
        """
        # 0 is closest, 1 is furthest
        return ((depth_map - np.min(depth_map)) / (np.max(depth_map) - np.min(depth_map)))

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
        depth_map_upscaled = cv2.resize(depth_map_scaled, (width, height), interpolation=cv2.INTER_CUBIC) / 255

        return depth_map_upscaled
    
    def generate_depth_map_performant(self, image: np.ndarray, intermediateWidth:int, intermediateHeight:int) -> np.ndarray:
        """
        Generate a depth map from an image.
        :param image: Image to generate a depth map from.
        :param intermediateWidth: Width to downscale the image to before generating the depth map.
        :param intermediateHeight: Height to downscale the image to before generating the depth map.
        :return: Depth map with largest value as closest.
        """
        image_downscaled = self.downscale_image(image, intermediateWidth, intermediateHeight)
        depth_map_downscaled = self.generate_depth_map(image_downscaled)
        depth_map_upscaled = self.upscale_depth_map(depth_map_downscaled, image.shape[1], image.shape[0])
        return depth_map_upscaled

    def colour_depth_map(self, depth_map: np.ndarray) -> np.ndarray:
        """
        Colour the depth map using the jet colormap.
        :param depth_map: Depth map to colour.
        :return: Coloured depth map.
        """
        depth_map_scaled = (depth_map * 255).astype(np.uint8)
        return cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)



# Singleton instance to be imported
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
    # Display or save the image (for example, using OpenCV)
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
    # Display or save the image (for example, using OpenCV)
    cv2.imshow('Depth Map Downscaled Upscaled', depth_map_colored_upscaled)


    cv2.waitKey(0)  # Wait until a key is pressed
    cv2.destroyAllWindows()

