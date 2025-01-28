# Anaglyph AI
A Flask-React website that allows a user to upload a monocular image, and converts it to a [3D Anaglyph](https://en.wikipedia.org/wiki/Anaglyph_3D) image to be viewed with red-cyan glasses

## Contents
- [Image Upload and Depth Map Generation](#image-upload-and-depth-map-generation)
- [Anaglyph Generation and Editor](#anaglyph-generation-and-editor)
- [Converting from Monocular to Stereoscopic](#converting-from-monocular-to-stereoscopic)
  - [Depth Map Generation](#depth-map-generation)
  - [Stereo Image Pair Generation from Depth Data](#stereo-image-pair-generation-from-depth-data)
  - [Merging Stereo Images into an Anaglyph](#merging-stereo-images-into-an-anaglyph)
- [Pop In vs Pop Out](#pop-in-vs-pop-out)
- [Strength](#strength)
- [Retinal Rivalry](#retinal-rivalry)
- [Examples](#examples)

## Image Upload and Depth Map Generation
<img width="1471" alt="image" src="https://github.com/user-attachments/assets/9a7ac356-cd8e-432a-ac8c-47cd19b80586" />

## Anaglyph Generation and Editor
<img width="947" alt="image" src="https://github.com/user-attachments/assets/3628605c-d1b2-4cc4-832b-f9c14ed3ed17" />

## Converting from Monocular to Stereoscopic
3D images are usually created from taking two photographs from slightly shifted positions, to mimic how our eyes each see a slightly shifted version of the image the other eye sees. 
![image](https://github.com/user-attachments/assets/beeb8709-ae66-4e25-a2be-237df13d1063)
These are called stereoscopic images, and when one eye sees one image and the other eye sees the other image, the disparity between the images is used by our brain to determine the depth of different objects in the image. However, requiring two photos to be taken right next to each other is both tedious and requires intention of creating a stereoscopic image pair - if you only take one photo in the moment, you cannot make it 3D later on. This was the problem I intended to solve. 

The creation of a stereo image pair from a single monocular image can be broken down into 2 steps: generating a depth map, and then using the depth data to transform the image to a left and right eye image.

### Depth Map Generation
I used [DepthAnythingV2](https://github.com/DepthAnything/Depth-Anything-V2), an open source depth estimation model, to generate a depth map for the image.

### Stereo Image Pair Generation from Depth Data
I implemented this by first setting a max disparity in terms of number of pixels. This dictates the furthest a pixel in one eye image can be from the corresponding pixel in the other eye image, and can be thought of as the strength of the 3D Anaglyph. Then, I create a 2D NumPy array of shifts, which dictates how far each pixel would have to move from the original image to generate an eye image. This shifts array is calculated as a linear interpolation between 0 and max disparity, with the parameter being the normalised depth data. Once I have the shifts array, I use some NumPy magic and advanced indexing to move all the pixels to their appropriate location, with the closer pixel taking priority if two pixels end up in the same location. 

However, this leaves "holes" in the eye image, or rather black pixels, where no pixels have ended up after being shifted.
![image](https://github.com/user-attachments/assets/6dc7579a-e432-4dc6-8bb7-9745b5875b0b)
![image](https://github.com/user-attachments/assets/c639a335-09ea-407f-9ec7-6e84520d9653)

This is inevitable: when generating stereo images from a monocular image, we are simply missing information, such as "what is behind the edge that they left eye should have been able to see?" 
To fix this, I first considered implementing a forward fill, but it is ambiguous whether the pixels in the background or those in the foreground should be used to fill the holes, as this depends on the actual geometry of the closer object. Therefore, I used OpenCV's [inpainting](https://docs.opencv.org/4.x/d7/d8b/group__photo__inpaint.html) function to fill the holes, specifically INPAINT_TELEA, as per this [comparative study](https://globaljournals.org/GJCST_Volume21/2-Comparative-Study-of-OpenCV.pdf) of the different inpaint functions efficiency.

### Merging Stereo Images into an Anaglyph
After generating the left eye and right eye image, I make the anaglyph image by setting the red channel to that of the left eye image, and the green and blue channel to that of the right eye image. Note: when minimising retinal rivalry, it is a little more complicated and involves transforming the colours of the two images with specific matrices, and then addding the images together 

## Pop In vs Pop Out
This option determines where the zero parallax plane is in the scene, which determines if objects appear to be popping into (behind) or poppoing out of (in front of) the screen. Whatever objects are at the zero parallax plane will appear to be at the exact distance of the screen, as no shifting will be performed on them. This is analogous to the focal plane of the eyes. 

However to simplify use, I have decided to restrict the zero parallax plane to be either be at the distance furthest object, which causes the furthest object to appear at the screen distance, and everything else to appear in front of the screen, or the zero parallax plane is at the distance of the closest object, which causes the closest object to appear at the screen distance, and everything else to appear behind the screen. 

To see this effect with red-cyan anaglyph glasses, below is a pop in version of an image, and then a pop out version of the image. I have also added a horizontal bar which should appear to be at the distance of the screen to more easily see in which direction the 3D effect is acting.

<img width="700" alt="image" src="https://github.com/user-attachments/assets/632ef99f-5844-4337-9364-2e2fd8b99e12" />

## Strength
This slider actually sets the maximum disparity in terms of a percentage of the image width, from 0% to 6%. This means at 0%, there is no 3D effect, and at 6% of the image width, the two points with the most disparity (the furthest point in pop in, or the closest point in pop out) will have a distance of 6% of the image width between them when comparing the left eye image to the right eye image.

<img width="1198" alt="image" src="https://github.com/user-attachments/assets/5d946aad-f18c-45a1-9303-32b4655458e4" />



## Retinal Rivalry
Retinal rivalry (or [binocular rivalry](https://en.wikipedia.org/wiki/Binocular_rivalry)) is a visual phenomenon that occurs when each eye recieves different information, and the brain cannot reconcile them. This causes a "flashing" effect, where briefly, one eye will dominate, and you will see what that eye sees, and then the other will take over, and so on (although if you have a very dominant eye, this may not happen as much). 

When wearing red-cyan anaglyph glasses, this effect occurs most strongly when viewing a red portion of an image, as the red filter causes the left eye to see a bright portion, while the cyan filter causes the right eye to see a a dark portion. This conflict causes retinal rivalry, and can make viewing images with red in them uncomfortable.

If you are viewing with red-cyan analgyph glasses currently, take a look at the colours below and note the uncomfortable flashing effect in the red portion at the top:

<img src="https://github.com/user-attachments/assets/5729f953-b91a-41f2-b17d-9509f639f806" width="400" />


To allow the user to reduce the retinal rivalry that the anaglyph produces, I implemented a minimise retinal rivalry option when generating the anaglyph. This is based on the optimised matrices from a [Sanders and McAllister paper](https://research.csc.ncsu.edu/stereographics/ei03.pdf) on transforming the colours of the stereo images before merging them to minimise the sum of the distances between the anagylph color and the left and right eye colors. This is calculated in the CIE Lab colour space, as it is perceptually uniform, and works to minimise retinal rivalry by minimising how different the image seen by the left eye is to the image seen by the right eye.

The result of this on the image above is:

<img src="https://github.com/user-attachments/assets/4f291005-7a0f-449d-9c73-9e0cd8569a03" width="400" />

When viewed through red-cyan anaglyph glasses, the previously "flashing" red portion will now be significantly more stable, and more green, whereas through the glasses the rest of the colours should appear only very slightly affected. Interestingly, the transformation seems very similar to deuteranopia, or red-green colour blindness, when viewed without the glasses.

In a real photo example, compare - through red-cyan anaglyph glasses - the retinal rivalry on my friend in the middle's coat, before and after minimising retinal rivalry:

<image src="https://github.com/user-attachments/assets/a55a2adc-6ca6-4225-8f0d-dbf1a85e76ae" width="400" />
<image src="https://github.com/user-attachments/assets/b1b3c879-6dc9-43fe-adde-c49e55860d30" width="400" />

## Examples
*All have minimise retinal rivalry selected, for more pleasant viewing experience through red-cyan anaglyph glasses*
![anaglyph](https://github.com/user-attachments/assets/9cdc29fe-57e3-4037-a2ab-d247ec066850)
![anaglyph-2](https://github.com/user-attachments/assets/328ecaad-fcf4-4d34-8f62-3255f6b07a27)
![anaglyph-9](https://github.com/user-attachments/assets/44a2a282-5d13-423c-8aea-9441c00ad92f)
![image](https://github.com/user-attachments/assets/4f4c3b7d-c07b-42e2-a948-34398b728519)
![image](https://github.com/user-attachments/assets/cb994d7f-954f-4b67-9dd4-fd9f18551ef9)
![image](https://github.com/user-attachments/assets/d8e65ce0-0c3e-4dc5-8f9b-79c870aa5dfd)
![image](https://github.com/user-attachments/assets/7ec5c66c-5e29-4e96-9454-3f353df7422c)
![anaglyph-13](https://github.com/user-attachments/assets/b9960291-847a-42e3-a210-6fa46476b5f6)
![anaglyph-14](https://github.com/user-attachments/assets/a016b43a-dc3f-469e-a9dd-e158230052d1)
![anaglyph-15](https://github.com/user-attachments/assets/46ba0c87-b367-4f86-a391-90587a367b78)
![anaglyph-16](https://github.com/user-attachments/assets/79e81159-522b-4760-9c67-0bc2ec66e456)
![anaglyph-17](https://github.com/user-attachments/assets/2d84ea9c-83c5-470b-8788-39ac33d9e16b)











