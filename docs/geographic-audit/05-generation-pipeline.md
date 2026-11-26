# Generation pipeline

This is a recommendation for a later change, after the owner accepts a boundary and a height rule. It is fitted to the current page: Three.js r187, no build, live county footprints, merged 96 m chunks, instanced glass, fog at 140–670 m, one shadow map. It does not replace `src/buildings.js` in this branch.

The aim is one generator for a whole block. Landmarks stay as individual models. The turret-corner and clock-tower GLBs on PR #2 are the kind of anchor that should stay hand-built. This audit did not open that branch.

## 1. Keep the county footprint as the ground plan

`fetchFootprints` already returns the outline, the holes, the address, the class, and `BLDG_ID`. Keep that request. Do not redraw the city from a second footprint set. The Planning 3D parts are split (mechanical penthouses, towers, garage decks) and 281 of them did not fall inside a county footprint. They are a height source, not a new street wall.

## 2. Attach a height only when the tables agree

For each county footprint:

1. Query Planning 3D parts whose centroid falls inside the footprint. Convert `BLDG_HEIGHT` and `BLDG_ELEV` from feet with 0.3048.
2. Query the Rockville building layer for parts in the same footprint.
3. Choose the Planning part with the largest area as the main roof candidate.
4. If a Rockville part overlaps that piece and the two heights differ by more than 20%, do not invent a third number. Leave the footprint on the current estimated formula and flag it. 51 Monroe Place fails this test (241.6 ft versus 74.4 ft). The Executive Office Building passes it (222.9 ft versus 207.2 ft) and would use the Planning value, 67.9 m, instead of the game's 24.3 m.
5. If only one source has a height, use it and record which source. If neither does, keep `massHeight`. Do not fill a measured building with the area formula.

Where several parts on one footprint differ by more than 3 m, extrude the main footprint to the largest-area height and add the smaller parts as separate masses. That is how 401 Hungerford stops being a single 37 m slab over a 4.5 m wing. Cap the extra masses at a count per footprint so a mechanical farm does not become hundreds of draw calls. Merge them into the existing 96 m chunks.

Set the building's base to `(BLDG_ELEV_ft * 0.3048) - demAtOrigin`, once the ground itself uses the DEM. Until the ground is a DEM, a per-building base just floats buildings off a flat plane and looks wrong. Do the terrain step in the same change as the bases.

## 3. Roof rule from the Rockville code, not from a random choice

Inside the game bounds the Rockville layer is 1,631 flat, 202 gable, 1 not applicable. The generator should:

- Use the Rockville `ROOF_TYPE` when the part overlaps the footprint.
- If there is no Rockville hit, use flat. That is the majority class, and it is the honest default. It is not a guess about a particular building.
- For `Gable`, build one ridge along the long axis of the footprint, eave at the measured wall height, ridge a fixed fraction above it. Do not invent the fraction from a photo. A starting fraction has to be taken from the LiDAR later. Until a DSM or the LAS is sampled, draw gables as a low ridge (for example 2 m) and label the ridge height as a placeholder in the material name so it is not mistaken for a measurement.
- Ignore the Planning description's claim of a roof-type field. The field is not on the service.

## 4. Facade kits, one material set

The current palette is five wall colors and instanced windows on a 3.25 m bay inside 152 m of the junction. Extend that, do not replace it with a unique texture per address.

Kit choice, in order, from attributes that exist:

| Kit | When |
| --- | --- |
| Low residential | `LANDUSE` is single family, or Rockville roof is gable, and height is under 10 m |
| Street commercial | Retail, or a Hungerford / Pike address, height under 12 m. Brick-tinted wall, larger ground-floor bay |
| Mid-rise flat | Multi-family or office, 12–40 m, flat roof. The current window instancing |
| Tall flat | Anything the height rule accepts over 40 m. Same kit as mid-rise, no recessed top unless the part geometry already has a setback |
| Garage | Feature code 2205. Fewer windows, darker wall |
| Shed / skip | `LANDUSE` Shed, or area under 30 m². Extrude, no windows. There are 518 shed parts in the bounds |

`YEAR_BUILT` of 0 is not an era. Where the year is at least 1800, use it only to pick a brick tint versus a cooler concrete tint (before 1940 versus after). Do not invent cornices, turret counts, or signage from the year.

Shared edges of about 7,030 m should be welded or one of the two coincident faces dropped. The current double extrusion z-fights and wastes triangles. Class `Q` is only 53 footprints; the shared-edge test is the one that finds the party walls.

## 5. Terrain from the DEM, not from street elevation

Sample `MD_montgomery_dem_m` on a 10 m grid over the accepted polygon. The identify call used in this audit returns metres. Subtract the DEM at the game origin (133.52 m) so the origin stays near Y = 0. Build one ground mesh. Move each building base with `BLDG_ELEV` in the same vertical datum.

Do not use `F_ELEV` / `T_ELEV` on the street centerlines. They were 0 on the downtown segments inspected.

A 10 m grid across the working rectangle (about 1.11 km by 1.62 km) is roughly 110 by 160 samples, one mesh. That fits the current shadow and fog budget. A 1 m grid does not need to be a mesh; the DEM's own pixel is already 1 m and would be a normal map or a collision height field, not 1.8 million triangles.

## 6. Streets, sidewalks, lots, trees

- Keep the county centerlines for navigation. Replace the five estimated half-widths only when a planimetric road polygon is sampled. The Rockville Impervious Surface service has a Roads layer (layer 3). Its widths were not measured in this audit, so the generator should read polygon width from that layer rather than keep 4.1 m as if it were surveyed.
- Replace the +2 m sidewalk ribbon with the Planning sidewalk polygons (2,826 in the current bounds), simplified. Where Rockville has a `WIDTH`, use it. Do not draw a sidewalk on the 80 segments the city marks missing.
- Draw the 197 parking polygons as flat surfaces on the terrain, not as buildings.
- Trees: do not mesh 28,810 canopy polygons. Sample one instance point per canopy polygon above a size threshold, or one point per 12 m cell inside the "No Change" and "Gain" classes, and instance a few trunk and crown meshes. Canopy height in feet exists as a 5.9 GB planning download that was not fetched. Until that raster is sampled, do not assign a tree height. Use one crown height and say so.
- The pedestrian bridge is one model, placed on OSM way 266681164 / county `ROCKVILLE METRO PED BRG`, deck at the station-side elevation from the DEM plus a clearance this audit did not measure. The glass enclosure is supported by the city's 2020 repair notice, not by the planimetric surface code. Build it as a landmark, not as a footprint extrusion. Clearance and deck width still need a measurement; polygon 1319 gives the plan area (4,665 square feet in the layer's `SHAPE.AREA`) and not a section.

## 7. What stays hand-modelled

Anything that is a visual anchor and is not a box: the glass bridge, the two GLB landmarks already started on PR #2, and any later clock, kiosk, or metro canopy. The generator should leave a hole, or a low placeholder, where a landmark id is assigned, so a block script does not extrude a box through the model.

Blocks that are not anchors — the Hungerford one-storey retail, the gable houses east of the station, the flat-roof apartments — come from the kits above. That is the whole-block method. It uses the footprint once, the agreed height once, and a kit chosen from land use and roof code.

## 8. Order of work, after approval

1. Accept the boundary, including a west option and which east line is the roundabout.
2. Accept the 20% cross-check rule, or replace it.
3. Add the DEM ground and building bases together.
4. Swap estimated heights for agreed heights, weld shared edges, and apply roof codes.
5. Swap sidewalk ribbons for sidewalk polygons and add parking surfaces.
6. Instance canopy. Add the bridge as a single model once a deck height is measured.
7. Shoot the six pairs in [03-playable-boundary.md](03-playable-boundary.md) before calling the result a visual match.
