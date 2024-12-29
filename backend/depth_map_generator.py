class DepthMapGenerator:
    def __init__(self, path_to_image):
        self.path_to_image = path_to_image

if __name__ == '__main__':
    depth_map_generator = DepthMapGenerator()
    depth_map_generator.generate_depth_map()