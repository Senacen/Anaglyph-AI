import cv2

class DepthMapGenerator:
    # Not needed to declare in Python before assignment in constructor, but added for readability
    path_to_file = None
    image = None
    def __init__(self, path_to_file):
        self.path_to_image = path_to_file
        self.image = cv2.imread(path_to_file)
        cv2.imshow("Image", self.image)
        while True:
            key = cv2.waitKey(1)
            if key == 27:
                break


if __name__ == '__main__':
    path_to_file = "resources/images/skyscrapers.jpeg"
    depth_map_generator = DepthMapGenerator(path_to_file)
    # depth_map_generator.generate_depth_map()