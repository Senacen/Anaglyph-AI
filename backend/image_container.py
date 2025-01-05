import cv2
import time
import numpy as np
from depth_map_generator import depth_map_generator
from anaglyph_generator import anaglyph_generator


class ImageContainer:
    def __init__(self, path_to_file, pop_out, max_disparity):

        start_time = time.time()
        self.path_to_file = path_to_file
        self.image = cv2.imread(path_to_file)
        if self.image is None:
            raise FileNotFoundError(f"Image not found at path: {path_to_file}")
        self.depth_map = depth_map_generator.generate_depth_map(self.image)
        end_time = time.time()
        print(f"Elapsed time for depth map: {end_time - start_time:.4f} seconds")

        self.depth_map_coloured = depth_map_generator.colour_depth_map(self.depth_map)

        start_time = time.time()
        self.left_image, self.right_image = anaglyph_generator.generate_stereo_images(self.image, self.depth_map, pop_out, max_disparity)
        self.anaglyph = anaglyph_generator.generate_pure_anaglyph(self.left_image, self.right_image)
        end_time = time.time()
        print(f"total Elapsed time for anaglyph generation from depth map: {end_time - start_time:.4f} seconds")

    def show_images(self, width=500):
        """
        Display the original image, depth map, and colored depth map in separate windows.
        :param width: Desired width for the display windows. Height is adjusted to maintain aspect ratio.
        """
        # Create a list of images and their corresponding window names
        images = {
            'Original Image': self.image,
            'Depth Map Coloured': self.depth_map_coloured,
            'Left Image': self.left_image,
            'Right Image': self.right_image,
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
        cv2.imshow("Anaglyph", self.anaglyph)
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

def text_anaglyph(path_to_file, pop_out, max_disparity):
    image = cv2.imread(path_to_file)
    left_image = image.copy()
    # Right image is the shifted version
    rows, cols, _ = image.shape
    translation_matrix = np.float32([[1, 0, max_disparity], [0, 1, 0]])
    right_image = cv2.warpAffine(image, translation_matrix, (cols, rows))

    # swap left and right images if pop_out is True
    if pop_out:
        left_image = right_image.copy()
        right_image = image.copy()

    anaglyph = anaglyph_generator.generate_pure_anaglyph(left_image, right_image)
    cv2.imshow('Left Image', left_image)
    cv2.imshow('Right Image', right_image)
    cv2.imshow("image", image)
    return anaglyph

if __name__ == '__main__':
    # path_to_file = "backend/resources/images/skyscrapers.jpeg"
    # path_to_file = "backend/resources/images/amanda.jpeg"
    # path_to_file = "vresources/images/escher.jpeg"
    # path_to_file = "backend/resources/images/flowerTank.jpg"
    # path_to_file = "backend/resources/images/aiPaintSplash.jpg"
    # path_to_file = "backend/resources/images/nightFoliage.jpg"
    # path_to_file = "backend/resources/images/johnsGate.jpeg"
    # path_to_file = "backend/resources/images/EntryRenderingCompetition.jpeg"
    # path_to_file = "backend/resources/images/kittens.jpg"
    # path_to_file = "backend/resources/images/bars.jpg"
    # path_to_file = "backend/resources/images/titanic.webp"
    # path_to_file = "backend/resources/images/icy spicy.jpeg"
    # path_to_file = "backend/resources/images/icy spicy alone.JPG"
    # path_to_file = "backend/resources/images/waterLily.jpg"

    path_to_file = "backend/resources/images/anaglyph_ai.png"
    text_anaglyph = text_anaglyph(path_to_file, pop_out=True, max_disparity=15)
    cv2.imshow('Anaglyph', text_anaglyph)
    cv2.imwrite('backend/resources/images/anaglyph_ai_pop_out.png', text_anaglyph)

    cv2.waitKey(0)
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    path_to_file = filedialog.askopenfilename()
    image_container = ImageContainer(path_to_file, pop_out=True, max_disparity=50)
    image_container.show_images()



