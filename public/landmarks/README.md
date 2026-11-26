# Rockville landmarks

Stylized, low-poly landmark buildings for the Rockville Town Center map.

| File | Tris | Footprint (X × Z) | Height |
| --- | --- | --- | --- |
| `turret_corner_building.glb` | 9,576 | 30.8 m × 29.8 m | 21.8 m flat roof; turret finial tip 38.9 m |
| `clock_tower_building.glb` | 16,394 | 46.8 m × 21.8 m | 27.2 m mansard top (gables 28.2 m); clock spire tip 42.0 m |

## Conventions

- glTF, +Y up, 1 unit = 1 m. The origin is the centre of the footprint bounding box, and y = 0 is the ground.
- Each file has one mesh with one primitive per material. Edit the materials by name in three.js.
- No textures. Colours are flat material colours.

## Orientation in the model's own axes

**turret_corner_building.glb**
- The main facade (wing A) faces **+Z** and runs along +X from the turret.
- The second facade (wing B) faces **−X** and runs back along −Z.
- The turret is centred at (x −10.3, z +9.8). The rounded corner points to **(−X, +Z)**.
- To point the corner northeast in this repo's world (+X east, −Z north), use `rotation.y = Math.PI`. Wing A then faces north and wing B faces east.

**clock_tower_building.glb**
- The main facade faces **+Z**. That side has the gables, arched windows and green awnings.
- The clock tower is at the **−X** end, centred at (x −17.0, z +4.7). It stands 1.3 m proud of the facade.
- There is a clock face on all four sides, set to 10:07.
- The real building's clock tower faces west onto the Town Square plaza. To make the facade face west (−X), use `rotation.y = -Math.PI / 2`.

## Materials

- **turret_corner_building.glb:** Brick, Trim, Roof, Windows, WindowsLit (warm emissive), Frames, Storefront, Signage, RoofFlat.
- **clock_tower_building.glb:** Brick, Trim, Roof, Windows, Frames, Storefront, Awning, Metal, ClockFace, ClockHands, ClockRim, RoofFlat.
