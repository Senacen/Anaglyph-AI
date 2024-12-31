import numpy as np
import cv2
from depth_map_generator import depth_map_generator

# Singleton
class AnaglyphGenerator:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(AnaglyphGenerator, cls).__new__(cls)
        return cls._instance

    # PPI of retina display is 254, which is exactly 100 PPCM
    def generate_stereo_image(self, image: np.ndarray, depth_map_normalised: np.ndarray, pop_out=False, max_disparity=100) -> (np.ndarray, np.ndarray):
        """
        Generate a stereo image pair from a single image.
        :param image: Image to generate a stereo pair from.
        :param depth_map_normalised: Normalised depth map.
        :param pop_out: Whether to make the image pop out or sink in.
        :param max_disparity: Maximum disparity value.
        :return: Stereo image pair (left, right).
        """

        height, width, _ = image.shape

        # Right image has to be original shifted left, so right image has to sample pixels to the right of the corresponding pixel in the original
        # Left image has to be original shifted right, so left image has to sample pixels to the left of the corresponding pixel in the original
        # The further away the pixel, the more it has to shift, with a linear interpolation between 0 and max_disparity / 2
        max_disparity_from_original = max_disparity / 2

        # Vectorise and precompute the shifts
        # Pop out true or false flips the depth map, to make the closest have more disparity or make the furthest have more disparity
        shifts = np.round(self.lerp(0, max_disparity_from_original, depth_map_normalised if pop_out else 1 - depth_map_normalised)).astype(np.int32)

        # Vectorise Shifting
        cols = np.arange(width) # [0, 1, 2, ..., width - 1]
        # Pop out true or false flips the direction of the shift
        if pop_out:
            left_samples = cols - shifts # Broadcasts cols, and results in a 2D array where left_samples[row, col] = sample_col
            right_samples = cols + shifts
        else:
            left_samples = cols + shifts
            right_samples = cols - shifts

        left_samples = np.clip(left_samples, 0, width - 1) # Clip into range
        right_samples = np.clip(right_samples, 0, width - 1) # TODO: Check if this causes stretched pixels

        rows = np.arange(height).reshape(height, 1) # make a rows index column vector
        # Sample the pixels, rows is broadcast to 2D and the samples are used to get the row and col indices of each cell in image for each cell in left and right image
        left_image = image[rows, left_samples]
        right_image = image[rows, right_samples]
        # TODO: Figure out why escher columns are too thin

        return left_image, right_image

# TODO: make optimised anaglyph filters
    def generate_anaglyph(self, left_image: np.ndarray, right_image: np.ndarray) -> np.ndarray:
        """
        Generate an anaglyph image from a stereo image pair.
        :param left_image: Left image of the stereo pair.
        :param right_image: Right image of the stereo pair.
        :return: Anaglyph image.
        """
        # Create an anaglyph image by combining the left and right images
        # BGR format
        # Initialize the anaglyph image
        anaglyph = np.zeros_like(left_image)
        # Assign channels directly
        anaglyph[:, :, 0] = right_image[:, :, 0]  # Blue channel from right image
        anaglyph[:, :, 1] = right_image[:, :, 1]  # Green channel from right image
        anaglyph[:, :, 2] = left_image[:, :, 2]  # Red channel from left image

        return anaglyph

    def lerp(self, a, b, t):
        """
        Linear interpolation between a and b.
        :param a: start ndarray or scalar
        :param b: end ndarray or scalar
        :param t: progress
        """
        return a + t * (b - a)


# Singleton instance to be imported
anaglyph_generator = AnaglyphGenerator()

if __name__ == '__main__':
    path_to_file = "resources/images/amanda.jpeg"
    image = cv2.imread(path_to_file)
    depth_map = depth_map_generator.generate_depth_map(image)
    # Normalize the depth map to the range [0, 1]
    depth_map_normalised = depth_map_generator.normalise_depth_map(depth_map)
    # Generate stereo image pair
    left_image, right_image = anaglyph_generator.generate_stereo_image(image, depth_map_normalised)
    # Display the stereo image pair
    cv2.imshow('Left Image', left_image)
    cv2.imshow('Right Image', right_image)
    cv2.waitKey(0)  # Wait until a key is pressed
    cv2.destroyAllWindows()
