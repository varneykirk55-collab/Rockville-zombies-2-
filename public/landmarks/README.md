# Rockville landmarks

Stylized, low-poly landmark buildings for the Rockville Town Center map.

| File | Tris | Footprint (X × Z) | Height |
| --- | --- | --- | --- |
| `turret_corner_building.glb` | 21,068 | 31.5 m × 30.5 m | 21.8 m flat roof; turret drum 27.9 m; cone tip 42.3 m; finial 45.1 m |
| `clock_tower_building.glb` | 20,730 | 42.8 m × 20.2 m | 21.8 m cornice; 27.0 m mansard; gable peaks 29.4 m; tower eave 35.4 m; spire tip 41.8 m |

## Conventions

- glTF, +Y up, 1 unit = 1 m. The origin is the centre of the footprint bounding box, and y = 0 is the ground.
- Each file has one mesh with one primitive per material. Edit the materials by name in three.js.
- No textures. Colours are flat material colours.

## Orientation in the model's own axes

**turret_corner_building.glb**
- The main facade (wing A) faces **+Z** and runs along +X from the turret.
- The second facade (wing B) faces **−X** and runs back along −Z.
- The turret is centred at (x −11.3, z +10.8). The rounded corner points to **(−X, +Z)**.
- To point the corner northeast in this repo's world (+X east, −Z north), use `rotation.y = Math.PI`. Wing A then faces north and wing B faces east.

**clock_tower_building.glb**
- The main facade faces **+Z**. That side has the gables, arched windows and green awnings.
- The clock tower is at the **−X** end, centred at (x −15.0, z +4.1). It is 9 m wide and nearly flush, standing 0.3 m proud of the facade.
- There is a clock face on all four sides, set to 10:07.
- The real building's clock tower faces west onto the Town Square plaza. To make the facade face west (−X), use `rotation.y = -Math.PI / 2`.

## Materials

- **turret_corner_building.glb:** Brick, Trim, Roof, Windows, WindowsLit (warm emissive), Frames, Storefront, Signage, RoofFlat.
- **clock_tower_building.glb:** Brick, Trim, Roof, Windows, Frames, Storefront, Awning, Metal, ClockFace, ClockHands, ClockRim, RoofFlat.
