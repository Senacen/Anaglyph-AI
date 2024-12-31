import numpy as np
import cv2
from depth_map_generator_module import depth_map_generator

# Singleton
class StereoGenerator:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(StereoGenerator, cls).__new__(cls)
        return cls._instance

    # PPI of retina display is 254, which is exactly 100 PPCM
    def generate_stereo_image(self, image: np.ndarray, depth_map_normalised: np.ndarray, max_disparity=100) -> (np.ndarray, np.ndarray):
        """
        Generate a stereo image pair from a single image. Makes it pop into the screen, so the plane of zero disparity is the closest point in the depth map.
        :param image: Image to generate a stereo pair from.
        :param depth_map_normalised: Normalised depth map.
        :param max_disparity: Maximum disparity value.
        :return: Stereo image pair (left, right).
        """
        # Initialise the left and right images
        left_image = np.zeros_like(image)
        right_image = np.zeros_like(image)
        height, width, _ = image.shape

        # Right image has to be original shifted left, so right image has to sample pixels to the right of the corresponding pixel in the original
        # Left image has to be original shifted right, so left image has to sample pixels to the left of the corresponding pixel in the original
        # The further away the pixel, the more it has to shift, with a linear interpolation between 0 and max_disparity / 2
        max_disparity_from_original = max_disparity / 2

        import time
        start_time = time.time()
        # Vectorise and precompute the shifts
        shifts = self.lerp(0, max_disparity_from_original, depth_map_normalised)
        end_time = time.time()
        elapsed_time = end_time - start_time
        print(f"Elapsed time for precomputing shifts: {elapsed_time:.4f} seconds")
        # Use horizontal interpolation between pixels
        # Compute left image
        for row in range(height):
            for col in range(width):
                sample_x = col - int(shifts[row, col])
                if sample_x >= 0:
                    left_image[row, col] = image[row, sample_x]

        # Compute right image
        for row in range(height):
            for col in range(width):
                sample_x = col + int(shifts[row, col])
                if sample_x < width:
                    right_image[row, col] = image[row, sample_x]

        return left_image, right_image


    def lerp(self, a, b, t):
        return a + t * (b - a)


# Singleton instance to be imported
stereo_generator = StereoGenerator()

if __name__ == '__main__':
    path_to_file = "resources/images/amanda.jpeg"
    image = cv2.imread(path_to_file)
    depth_map = depth_map_generator.generate_depth_map(image)
    # Normalize the depth map to the range [0, 1]
    depth_map_normalised = depth_map_generator.normalise_depth_map(depth_map)
    # Generate stereo image pair
    left_image, right_image = stereo_generator.generate_stereo_image(image, depth_map_normalised)
    # Display the stereo image pair
    cv2.imshow('Left Image', left_image)
    cv2.imshow('Right Image', right_image)
    cv2.waitKey(0)  # Wait until a key is pressed
    cv2.destroyAllWindows()
