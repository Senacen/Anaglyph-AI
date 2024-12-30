import cv2
import time
import numpy as np
from depth_map_generator_module import depth_map_generator


class ImageContainer:
    def __init__(self, path_to_file):
        self.path_to_file = path_to_file
        self.image = cv2.imread(path_to_file)
        if self.image is None:
            raise FileNotFoundError(f"Image not found at path: {path_to_file}")
        self.depth_map = depth_map_generator.generate_depth_map(self.image)
        self.depth_map_normalised = depth_map_generator.normalise_depth_map(self.depth_map)
        self.depth_map_scaled = (self.depth_map_normalised * 255).astype(np.uint8)
        self.depth_map_colored = cv2.applyColorMap(self.depth_map_scaled, cv2.COLORMAP_JET)

    def show_images(self):
        cv2.imshow('Original Image', self.image)
        cv2.imshow('Depth Map', self.depth_map_colored)
        cv2.waitKey(0)  # Wait until a key is pressed
        cv2.destroyAllWindows()

if __name__ == '__main__':
    # path_to_file = "resources/images/skyscrapers.jpeg"
    path_to_file = "resources/images/amanda.jpeg"
    image_container = ImageContainer(path_to_file)
    image_container.show_images()

