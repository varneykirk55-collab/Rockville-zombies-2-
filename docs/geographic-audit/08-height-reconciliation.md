# Height reconciliation

The area-and-seed formula is not a fallback. If two measured heights conflict and no other source distinguishes them, the chosen height is blank and the row is Unresolved.

Table: [data/height-reconciliation.csv](data/height-reconciliation.csv), one row for each of the 508 county footprints whose centroid is inside the new polygon. Produced by `scripts/finalize_audit.py`.

## What the two numbers are

Both fields are heights above ground, in feet, not elevations above sea level.

Planning `BLDG_ELEV` at 51 Monroe Place is 422.21 ft and at 101 Monroe Street is 418.90 ft. Divided by 0.3048 those are 128.69 m and 127.68 m. The Maryland bare-earth DEM at those centroids is 129.79 m and 129.00 m. A roof elevation of 241 ft or 223 ft above sea level would be underground here (the ground is about 425 ft). Adding base plus height gives a roof near 664 ft and 642 ft above sea level, which is ground plus the height. So `BLDG_HEIGHT` is AGL.

The same test rejects a metres-stored-as-feet theory for the Executive Office Building: Rockville's 207.23 at that address matches a building of about 16 storeys, while 207 m would be about 680 ft and is not a Rockville building. The field is feet on both services. The Rockville copy's source-code domain stops at Captured 2020. Planning's domain includes 2023 and 2025, and most parts in the old rectangle are still source code 5 (Captured 2014). The dates explain drift. They do not by themselves pick a winner.

Planning splits some footprints into parts (penthouses, wings) and stores a height on each. The reconciliation uses the largest-area part as the main mass and keeps the tallest part in `planning_max_m`. Rockville does the same kind of split. A nearest Rockville part more than 15 m from the county centroid is ignored, because in this district that is often the next building.

## Published roofs for the two towers

Fetched from the SkyscraperPage HTML, not from a search summary.

| Building | Page | Floors | Roof | Also listed | Planning | Rockville nearest |
| --- | --- | --- | --- | --- | --- | --- |
| One Rockville Metro Center, addressed on the page as 51 Monroe Street. The county footprint is 51 Monroe Place. | [b943](https://skyscraperpage.com/b943/rockville/one-rockville-metro-center) | 19, finished 1979 | 240 ft (73.2 m), noted as Google Earth | Spire / mechanical equipment 246 ft (75.0 m) | 241.63 ft | 74.36 ft, a lower part named MC Government. No Rockville part in the downtown extract is near 240 ft. |
| Executive Office Building, 101 Monroe Street | [b75322](https://skyscraperpage.com/b75322/rockville/montgomery-county-executive-office-building) | 16, finished 1981 | 226 ft (68.9 m) | Antenna 262 ft (79.9 m) | 222.89 ft | 207.23 ft, same mass, about 2 m from the Planning centroid |

Planning matches the published roofs (1.6 ft and 3.1 ft). It does not match the spire or the antenna. Rockville's 74 ft at 51 Monroe Place is a different, lower mass in the complex, not the tower and not a unit error (74 m would be 244 ft, but the same field at 101 Monroe is clearly feet). Rockville's 207 ft at the Executive Office Building is the tower, about one storey under the published roof. The chosen values are the Planning figures: **73.65 m** and **67.94 m**, both High.

SKYDB lists One Rockville Metro Center at 69 m and 21 floors. That does not match the 240 ft roof or the Planning measurement, so it was not used.

The county press release of 15 May 2014 calls the Circuit Court south tower six storeys and says it connects to an older north tower that has at least floors 6 through 9. Planning 169 ft and Rockville 84 ft at 50 Maryland Avenue can be those two masses. No single height is chosen. Choice Hotels says the Cambria occupies eight floors of a 15-storey west tower at Rockville Town Square, and a 2007 Washington Post report described a 15-storey and an 18-storey tower on the block. Neither states a foot height. Planning 28.8 m is too short for 15 storeys. Rockville 41.8 m is still short of a typical 15-storey floor height. 196 East Montgomery Avenue stays Unresolved.

## Confidence

| Level | Rule | Chosen height |
| --- | --- | --- |
| High | The two GIS heights differ by at most 2 m or 10 percent, or a published roof agrees with Planning within about 3 percent | The Planning value, or the published match for the two towers |
| Medium | Only one measured source, and the Planning parts on that footprint agree within 3 m; or both sources are under 18 m and differ by at most 4 m | The single source, or the higher of the two measured values when the gap is under 4 m. The higher value keeps a parapet. It is not High, and it is not the area-seed formula |
| Unresolved | The sources differ by more than that and no published roof separates them; or the only city part is more than 8 m from the centroid; or nothing measured joined the footprint | Blank |

On the 508 footprints:

| Confidence | Count |
| --- | --- |
| High | 137 |
| Medium | 132 |
| Unresolved | 239 |

The Unresolved set is mostly footprints with no joined measurement (about 140 with neither source, plus city parts too far away to claim). The real conflicts, where both numbers exist and were not reconciled, are a few dozen. The ones that change the skyline:

| Address | Planning | Rockville | Ruling |
| --- | --- | --- | --- |
| 51 Monroe Place | 73.65 m | 22.67 m on a lower part | High, 73.65 m. See above. |
| 101 Monroe Street | 67.94 m | 63.16 m | High, 67.94 m. See above. |
| 50 Maryland Avenue, Circuit Court | 51.65 m | 25.62 m | Unresolved. Two towers. |
| 32 Courthouse Square, MCE Federal Credit Union | 43.99 m | 13.78 m | Unresolved. |
| 1 Church Street | 42.38 m | 32.65 m | Unresolved. |
| 315 N Washington Street | 40.83 m | no part within 15 m | Medium, 40.83 m. One source. |
| 118 Monroe Street, Americana Centre | 40.25 m | 36.82 m | High, 40.25 m. Inside the 10 percent band. |
| 191 East Jefferson Street, District Court | 36.83 m | 28.52 m | Unresolved. |
| 196 East Montgomery Avenue | 28.8 m | 41.77 m | Unresolved. Cambria / Town Square towers. |
| 451 Hungerford Drive | 29.87 m | 21.52 m | Unresolved. |

Americana Centre at 4 Monroe Street is High (35.2 m versus 34.8 m). The game's 40 m cap still cuts 51 Monroe Place and 101 Monroe Street by about 34 m and 28 m. Those two are the skyline error that a later extrusion has to fix, using the High values, not the formula.
