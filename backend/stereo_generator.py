import numpy as np

# Singleton
class StereoGenerator:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(StereoGenerator, cls).__new__(cls)
        return cls._instance

    def __init__:
        pass

    # PPI of retina display is 254, which is exactly 100 PPCM
    def generate_stereo_image(self, image: np.ndarray, depth_map_normalised: np.ndarray, max_disparity=10) -> (np.ndarray, np.ndarray):
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
        # Use horizontal interpolation between pixels
        # Left
        for row in range(height):
            for col in range(width):
                sample_col =


    def lerp(self, a, b, t):
        return a + t * (b - a)

    def lerp_colour(self, a, b, t):
        return tuple(int(self.lerp(a[i], b[i], t)) for i in range(3))

# Singleton instance to be imported
stereo_generator = StereoGenerator()