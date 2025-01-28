# Anaglyph AI
A website that allows a user to upload a monocular image, and converts it to a [3D Anaglyph](https://en.wikipedia.org/wiki/Anaglyph_3D) image to be viewed with red-cyan glasses

## Image Upload and Depth Map Generation
<img width="1471" alt="image" src="https://github.com/user-attachments/assets/9a7ac356-cd8e-432a-ac8c-47cd19b80586" />

## Anaglyph Generation and Editor
<img width="947" alt="image" src="https://github.com/user-attachments/assets/3628605c-d1b2-4cc4-832b-f9c14ed3ed17" />

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






