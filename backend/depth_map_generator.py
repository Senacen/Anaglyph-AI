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

class DepthMapGenerator:
    # Not needed to declare in Python before assignment in constructor, but added for readability
    path_to_file = None
    image = None
    def __init__(self, path_to_file):
        self.path_to_image = path_to_file
        self.image = cv2.imread(path_to_file)

    def generate_depth_map(self) -> np.ndarray:
        DEVICE = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'

        model_configs = {
            'vits': {'encoder': 'vits', 'features': 64, 'out_channels': [48, 96, 192, 384]},
            'vitb': {'encoder': 'vitb', 'features': 128, 'out_channels': [96, 192, 384, 768]},
            'vitl': {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
            'vitg': {'encoder': 'vitg', 'features': 384, 'out_channels': [1536, 1536, 1536, 1536]}
        }

        encoder = 'vits'  # or 'vitl', 'vits', 'vitb', 'vitg'

        model = DepthAnythingV2(**model_configs[encoder])
        model.load_state_dict(torch.load(f'ai_models/checkpoints/depth_anything_v2_{encoder}.pth', map_location='cpu'))
        model = model.to(DEVICE).eval()

        depth = model.infer_image(self.image)  # HxW raw depth map in numpy
        return depth

    def normalise_depth_map(self, depth_map: np.ndarray) -> np.ndarray:
        return (depth_map - np.min(depth_map)) / (np.max(depth_map) - np.min(depth_map))

if __name__ == '__main__':

    start_time = time.time()
    # path_to_file = "resources/images/skyscrapers.jpeg"
    path_to_file = "resources/images/amanda.jpeg"
    depth_map_generator = DepthMapGenerator(path_to_file)
    depth_map = depth_map_generator.generate_depth_map()
    # Normalize the depth map to the range [0, 1]
    depth_map_normalized = depth_map_generator.normalise_depth_map(depth_map)
    # Scale to 0-255
    depth_map_scaled = (depth_map_normalized * 255).astype(np.uint8)
    # Apply a colormap
    depth_map_colored = cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)
    # Display or save the image (for example, using OpenCV)
    cv2.imshow('Depth Map', depth_map_colored)

    # End time
    end_time = time.time()
    # Calculate the time taken
    elapsed_time = end_time - start_time
    print(f"Elapsed time for depth map: {elapsed_time:.4f} seconds")

    #cv2.waitKey(0)  # Wait until a key is pressed
    cv2.destroyAllWindows()

