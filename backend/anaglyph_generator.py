import numpy as np
import cv2
import time

from matplotlib.pyplot import imshow

from depth_map_generator import depth_map_generator

# Singleton
class AnaglyphGenerator:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(AnaglyphGenerator, cls).__new__(cls)
        return cls._instance

    def generate_stereo_images(self, image: np.ndarray, depth_map_normalised: np.ndarray, pop_out=True,
                              max_disparity=25) -> (np.ndarray, np.ndarray):
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

        start_time = time.time()
        # Vectorise and precompute the shifts
        # Pop out true or false flips the depth map, to make the closest have more disparity or make the furthest have more disparity
        shifts = np.round(self.lerp(0, max_disparity_from_original,
                                    depth_map_normalised if pop_out else 1 - depth_map_normalised)).astype(np.int32)

        # Vectorise Shifting
        cols = np.arange(width)  # [0, 1, 2, ..., width - 1]
        # Pop out true or false flips the direction of the shift
        if pop_out:
            left_end = cols + shifts  # Broadcasts cols, and results in a 2D array where left_samples[row, col] = sample_col
            right_end = cols - shifts
        else:
            left_end = cols - shifts
            right_end = cols + shifts

        left_end = np.clip(left_end, 0, width - 1)  # Clip into range
        right_end = np.clip(right_end, 0, width - 1)  # Removes pixels that would end up off screen

        rows = np.arange(height).reshape(height, 1)  # make a rows index column vector
        left_image = np.zeros_like(image)
        right_image = np.zeros_like(image)

        # Sample the pixels, rows is broadcast to 2D and the samples are used to get the row and col indices of each
        # cell in image for each cell in left and right image
        if pop_out:
            # Reverse the order of assignment for left, such that closer pixels overwrite further pixels
            # This was why the escher columns were very thin, the background was overwriting them
            # Don't worry about how it works, I just experimented with the code until it worked
            left_image[rows, left_end[:, ::-1]] = image[:, ::-1]
            right_image[rows, right_end] = image
        else:
            # Hypothesis: pop in reverses direction of shift, so default assignment will now work for left_image but not right
            # Above is actually wrong for some reason, the exact same code works for both pop_out and pop_in
            # My hypotheses why is that we would have needed to swap the right instead of the left to make closer pixels overwrite further pixels
            # But when pop in is required, we have reversed the direction of the depth map,
            # so we want "further" pixels (which are actually closer) to overwrite "closer" pixels (which are actually further)
            left_image[rows, left_end[:, ::-1]] = image[:, ::-1]
            right_image[rows, right_end] = image

        print(f"Elapsed time for stereo image pair with holes: {time.time() - start_time:.4f} seconds")

        start_time = time.time()
        left_image = self.fill_holes(left_image)
        right_image = self.fill_holes(right_image)  # Reverse the right image to fill holes from right to left
        print(f"Elapsed time for stereo image pair fill holes: {time.time() - start_time:.4f} seconds")
        return left_image, right_image

    def generate_stereo_right_from_left(self, left_image: np.ndarray, depth_map_normalised: np.ndarray, pop_out=True,
                               max_disparity=25) -> (np.ndarray, np.ndarray):

        """
        Generate the right image from the left image
        :param left_image: left image to generate a stereo right pair from.
        :param depth_map_normalised: Normalised depth map.
        :param pop_out: Whether to make the image pop out or sink in.
        :param max_disparity: Maximum disparity value.
        :return: Stereo image pair (left, right).
        """
        height, width, _ = left_image.shape

        start_time = time.time()
        # Vectorise and precompute the shifts
        # Pop out true or false flips the depth map, to make the closest have more disparity or make the furthest have more disparity
        shifts = np.round(self.lerp(0, max_disparity,
                                    depth_map_normalised if pop_out else 1 - depth_map_normalised)).astype(np.int32)

        # Vectorise Shifting
        cols = np.arange(width)  # [0, 1, 2, ..., width - 1]
        # Pop out true or false flips the direction of the shift
        if pop_out:
            # Broadcasts cols, and results in a 2D array where left_samples[row, col] = sample_col
            right_end = cols - shifts
        else:
            right_end = cols + shifts

        # Clip into range
        right_end = np.clip(right_end, 0, width - 1)  # Removes pixels that would end up off screen

        rows = np.arange(height).reshape(height, 1)  # make a rows index column vector
        right_image = np.zeros_like(left_image)

        # Sample the pixels, rows is broadcast to 2D and the samples are used to get the row and col indices of each
        # cell in image for each cell in left and right image

        # Both pop in and pop out work for right image assignment order
        right_image[rows, right_end] = left_image

        print(f"Elapsed time for right image with holes: {time.time() - start_time:.4f} seconds")

        start_time = time.time()
        right_image = self.fill_holes(right_image)  # Reverse the right image to fill holes from right to left
        print(f"Elapsed time for right image fill holes: {time.time() - start_time:.4f} seconds")
        return left_image, right_image


    def fill_holes (self, image: np.ndarray) -> np.ndarray:
        """
        Fills in black holes in the image using cv2.inpaint with the Telea algorithm.
        :param image: Image to be filled.
        :return: Filled image.
        """
        #cv2.imshow("Image", image)
        black_and_white = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        black_mask = ((black_and_white == 0) * 255).astype(np.uint8)
        # Inpainting Radius = 1 as the holes are very small as we need rough and fast
        # Currently takes 0.47 seconds to fill holes in water lily, can I improve with forward fill?
        # On second thoughts, forward fill should take as long, as this is roughly the same as generating the stereo image pair
        # And forward fill would require as many np vectorised functions
        filled_image = cv2.inpaint(image, black_mask, 1, cv2.INPAINT_TELEA)
        #cv2.imshow("Filled Image", filled_image)
        return filled_image

# TODO: make optimised anaglyph filters
    def generate_pure_anaglyph(self, left_image: np.ndarray, right_image: np.ndarray) -> np.ndarray:
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

    def generate_optimised_RR_anaglyph(self, left_image: np.ndarray, right_image: np.ndarray) -> np.ndarray:
        # https://cybereality.com/rendepth-red-cyan-anaglyph-filter-optimized-for-stereoscopic-3d-on-lcd-monitors/
        """
        Generate an optimised to reduce retinal rivalry anaglyph image with gamma correction from a stereo image pair, per https://cybereality.com/rendepth-red-cyan-anaglyph-filter-optimized-for-stereoscopic-3d-on-lcd-monitors/
        :param left_image:
        :param right_image:
        :return: Optimised anaglyph image.
        """
        left_filter_rgb = np.array([
            [0.4561, 0.500484, 0.176381],
            [-0.400822, -0.0378246, -0.0157589],
            [-0.0152161, -0.0205971, -0.00546856]
        ])

        right_filter_rgb = np.array([
            [-0.0434706, -0.0879388, -0.00155529],
            [0.378476, 0.73364, -0.0184503],
            [-0.0721527, -0.112961, 1.2264]
        ])

        # Reverse order of rows and columns as openCV uses BGR format not RGB which those matrices are for
        left_filter_bgr = left_filter_rgb[::-1, ::-1]
        right_filter_bgr = right_filter_rgb[::-1, ::-1]

        left_image_transformed = cv2.transform(left_image, left_filter_bgr)
        right_image_transformed = cv2.transform(right_image, right_filter_bgr)

        optimised_RR_anaglyph_image = left_image_transformed + right_image_transformed
        return optimised_RR_anaglyph_image



    def lerp(self, a, b, t):
        return a + t * (b - a)


# Singleton instance to be imported
anaglyph_generator = AnaglyphGenerator()

if __name__ == '__main__':
    path_to_file = "resources/images/kittens.jpg"
    image = cv2.imread(path_to_file)
    depth_map = depth_map_generator.generate_depth_map(image)
    # Normalize the depth map to the range [0, 1]
    depth_map_normalised = depth_map_generator.normalise_depth_map(depth_map)
    # Generate stereo image pair
    left_image, right_image = anaglyph_generator.generate_stereo_images(image, depth_map_normalised, max_disparity=25)
    # Display the stereo image pair
    cv2.imshow('Left Image Both', left_image)
    cv2.imshow('Right Image Both', right_image)
    start_time = time.time()
    cv2.imshow("Anaglyph Pure Both", anaglyph_generator.generate_pure_anaglyph(left_image, right_image))
    print(f"Elapsed time for pure anaglyph: {time.time() - start_time:.4f} seconds")
    start_time = time.time()
    cv2.imshow("Anaglyph Optimised Both", anaglyph_generator.generate_optimised_RR_anaglyph(left_image, right_image))
    print(f"Elapsed time for optimised retinal rivalry anaglyph: {time.time() - start_time:.4f} seconds")
    # Generate only right image
    # left_image, right_image = anaglyph_generator.generate_stereo_right_from_left(image, depth_map_normalised, max_disparity=50)
    # cv2.imshow('Left Image Right', left_image)
    # cv2.imshow('Right Image Right', right_image)
    # cv2.imshow("Anaglyph Right", anaglyph_generator.generate_anaglyph(left_image, right_image))
    # Generate stereo image pair
    cv2.waitKey(0)  # Wait until a key is pressed
    cv2.destroyAllWindows()
