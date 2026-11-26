# Proposed districts

Four areas tile the irregular boundary. They are assignment areas, not neighborhoods or zoning. The east residential blocks from the old rectangle are not a district.

Map: [maps/districts.png](maps/districts.png)

GeoJSON: [data/districts.geojson](data/districts.geojson)

| District | Extent | Work that belongs here, still not started |
| --- | --- | --- |
| hungerford-corridor | West −77.155, east on the rail, north 39.09510, south 39.08850 | Both sides of Hungerford: the 800-block shops, Giant, the banks, Fire Station 3, the low commercial roofs. College stays north of the line. |
| town-center-core | West −77.155, east on the rail, 39.08240 to 39.08850 | The reconciled towers. 51 Monroe Place and 101 Monroe Street are High and can be extruded to 73.65 m and 67.94 m. The Circuit Court, 32 Courthouse Square, and 196 East Montgomery Avenue stay Unresolved and must not get a formula height. |
| metro-station | The bulge east of the rail, from the bridge to the parking corner at −77.14382, 39.08305 | Bridge placement on OSM way 266681164, the east loop (way 46963870), and the named station lots. Deck height is still unmeasured. |
| south-pike-approach | South of 39.08240, including the Monroe dip and the 700 Rockville Pike dip, and not the school polygon | Pike approach. 208 Monroe Street and Courthouse Exxon are inside. The OSM school polygon is not. |

A district must not keep its own copy of the footprint service. Filter the one county fetch by the polygon so `OBJECTID` stays the key used in the reconciliation CSV.

The metro district owns the bridge. The town-center district stops at the west end of the footway and does not build a second one.
