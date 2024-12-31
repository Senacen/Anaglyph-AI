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
        self.depth_map_coloured = cv2.applyColorMap(self.depth_map_scaled, cv2.COLORMAP_JET)

    def show_images(self, width=500):
        """
        Display the original image, depth map, and colored depth map in separate windows.
        :param width: Desired width for the display windows. Height is adjusted to maintain aspect ratio.
        """
        # Create a list of images and their corresponding window names
        images = {
            'Original Image': self.image,
            'Depth Map': self.depth_map_scaled,
            'Depth Map Coloured': self.depth_map_coloured,
        }
        # Create windows and display images using a loop
        for i, (window_name, img) in enumerate(images.items()):
            # Create named window
            cv2.namedWindow(window_name)
            # Resize image to maintain aspect ratio
            resized_image = self.resize_image(img, width)
            # Show the resized image in the corresponding window
            cv2.imshow(window_name, resized_image)
            # Move the window to a specific position
            cv2.moveWindow(window_name, width * i, 0)  # Position next to the previous window

        cv2.waitKey(0)  # Wait until a key is pressed
        cv2.destroyAllWindows()

    def resize_image(self, image, width):
        """
        Resize the image to the specified width, maintaining the aspect ratio.
        :param image: The original image to resize.
        :param width: The desired width for the resized image.
        :return: Resized image.
        """
        ratio = width / image.shape[1]  # width / original_width
        new_height = int(image.shape[0] * ratio) # original_height * ratio
        resized_image = cv2.resize(image, (width, new_height))
        return resized_image

if __name__ == '__main__':
    # path_to_file = "resources/images/skyscrapers.jpeg"
    # path_to_file = "resources/images/amanda.jpeg"
    path_to_file = "resources/images/escher.jpeg"
    image_container = ImageContainer(path_to_file)
    image_container.show_images()

