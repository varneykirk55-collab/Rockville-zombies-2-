# Historic Red Brick Courthouse validation

The asset depicts the 1891 Red Brick Courthouse at 29 Courthouse Square. The [approved architectural specification](../../historic-courthouse-spec.md), the supplied street photo (IMG_1503), and the [HABS MD-912 exterior photographs](https://commons.wikimedia.org/wiki/Category:Montgomery_County_Courthouse_(1891)) were used to review the exported model.

| Check | Result |
| --- | --- |
| Main wall planes | **31.70 m long × 19.51 m wide**, measured on the exported GLB. The stairs, roof overhangs, projecting bays and short west connector extend outside those planes. |
| Scale and placement | **1 unit = 1 m**. The origin is at the center of the principal walls on the front-grade datum. **+Y** is up and the entry faces **−Z** in local building axes. |
| Building and tower | Three main levels including the raised granite base. Six-level square tower, physically open crown and slate pyramid. The finial reaches **30.237 m** above the datum. |
| Entrance and oculus | Nine granite risers at **0.17 m** each, reaching **1.53 m** at the landing. Ray tests confirmed a clear path through an arcade bay and separate glazing and crossbars in the quartered circular window. |
| GLB | **1,857,216 bytes**, **24,782 triangles**, six mesh groups and 49 material primitives. The GLB embeds three 512 × 512 JPEG maps for common-bond brick, granite and slate. Stone, glass, wood and metal use separate materials. The file uses standard glTF 2.0 without a compression decoder. |
| Loading | Khronos glTF Validator reported **0 errors and 0 warnings**. Its 38 informational notices concern unused UVs on solid-color primitives. Three.js r187 loaded all three maps and rendered the exported model in Chromium WebGL 2 with software acceleration. The frame submitted 24,782 triangles in 49 draw calls. Mobile hardware performance remains untested. |

## Reference comparison

- **Front.** The street-level render follows the supplied photo's view from across East Montgomery Avenue, with the east wall visible beside the tower. Compare the square tower, pointed roof, open crown, quartered oculus, stacked window tiers and recessed paired doors reached by the granite stair.
- **East and west.** The HABS side views show the large four-light courtroom arches, paired high gable slots and distinct sash rhythms. The east side has the split lower pair under the gable. The west has three lower gable sashes, its own stepped side entrance, and the termination at the adjoining building.
- **Rear.** The HABS southeast view establishes the narrower gabled projection, paired center sashes and principal hipped roof with the masonry chimney. The render shows the lower row conservatively where the reference is obscured.

The full foundation opening count, portions of the rear lower row and concealed parts of the west junction remain unverified. Roof pitches, chimney positions and minor projection depths were estimated from photographs. The street-level render approximates the reference camera with simple foreground surfaces. Landscaping, adjacent buildings and site grading are outside this exterior asset. The GLB contains render geometry and materials. Placement and collision in the game are separate integration work.

## Rendered views

All six screenshots were rendered from a fresh import of the exported GLB at 1440 × 1040.

| | | |
| --- | --- | --- |
| [Front](front.jpg) | [Rear](rear.jpg) | [Left · east](left-east.jpg) |
| [Right · west](right-west.jpg) | [Elevated three-quarter](elevated-three-quarter.jpg) | [Street level](street-level.jpg) |
