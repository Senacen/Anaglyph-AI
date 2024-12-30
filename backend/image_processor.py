import cv2
import time
import numpy as np
from depth_map_generator_module import DepthMapGenerator

start_time = time.time()
# path_to_file = "resources/images/skyscrapers.jpeg"
path_to_file = "resources/images/amanda.jpeg"
image = cv2.imread(path_to_file)
depth_map = DepthMapGenerator.generate_depth_map(image)
# Normalize the depth map to the range [0, 1]
depth_map_normalised = DepthMapGenerator.normalise_depth_map(depth_map)
# Scale to 0-255
depth_map_scaled = (depth_map_normalised * 255).astype(np.uint8)
# Apply a colormap
depth_map_colored = cv2.applyColorMap(depth_map_scaled, cv2.COLORMAP_JET)
# Display or save the image (for example, using OpenCV)
cv2.imshow('Depth Map', depth_map_colored)
cv2.imshow('Original Image', image)

# End time
end_time = time.time()
# Calculate the time taken
elapsed_time = end_time - start_time
print(f"Elapsed time for depth map: {elapsed_time:.4f} seconds")

cv2.waitKey(0)  # Wait until a key is pressed
cv2.destroyAllWindows()