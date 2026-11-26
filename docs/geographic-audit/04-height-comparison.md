# Height comparison

The county footprints are what the game extrudes. Montgomery Planning's 3D layer is the measured-height table (feet, LiDAR-derived according to the service description). The City of Rockville building layer is a second height table, older, and it does not match Planning on the tallest buildings. This file reports both. It does not pick a winner.

The table [data/height-comparison.csv](data/height-comparison.csv) was written by `scripts/compare_heights.py` on 26 November 2026. Re-running that script re-queries the services.

## How a row was built

1. Download the 1,998 county footprints that intersect the game bounds. Area is the local-metre area, holes subtracted, using the same projection as `src/utils.js`.
2. Replay `massHeight` from `src/buildings.js`, including the 32-bit `Math.imul` seed. The Python replay matches Node on object ids 1, 134094, and 338888.
3. Download the 1,865 Planning 3D parts in the same rectangle. Place each part by the area centroid of its outer ring. Keep it when that centroid falls inside a county footprint and not in a hole.
4. For each footprint, the **primary** height is the Planning part with the largest plan area. The **max** height is the tallest part. Heights are converted with the international foot, 0.3048 m. The US survey foot differs by about 2 parts per million, under 2 cm on a 70 m building.
5. Error is game height minus primary height. Positive means the game is taller than the Planning part.

1,584 parts landed inside a footprint. 281 did not. 1,464 footprints received at least one part. The statistics below use the 1,243 of those with feature code 2201 (building, not garage) and area at least 30 m², so a shed sliver does not dominate the error.

Primary and max are almost the same distribution on this set (mean 7.61 m versus 7.64 m). The split matters on individual buildings. The DHHS building at 401 Hungerford Drive is the example: primary 4.5 m, max 31.2 m, game 36.6 m. The largest piece is a low wing. The game extrudes the whole footprint to one height near the tall piece.

## Error against the Planning primary height

| | Game height | Planning primary | Game minus primary |
| --- | --- | --- | --- |
| Count | 1,243 | 1,243 | 1,243 |
| Mean | 10.45 m | 7.61 m | +2.84 m |
| Median | 9.23 m | 6.51 m | +2.20 m |
| Minimum | 5.00 m | 2.44 m | −43.62 m |
| Maximum | 39.12 m | 73.65 m | +32.04 m |
| MAE | | | 4.56 m |
| RMSE | | | 6.97 m |
| 10th / 90th percentile | | | −2.84 m / +8.31 m |

Absolute error within 2 m: 422 footprints (34.0%). Within 5 m: 873 (70.2%). Within 10 m: 1,127 (90.7%). Within 15 m: 1,171 (94.2%).

The game floor and cap explain the shape of the error. 353 primary heights are under 5 m, and the formula cannot go below 5 m, so small buildings are pulled up. Seven primary heights are over 40 m, and the formula cannot go above 40 m, so the tall buildings are cut off. The mean error is positive because there are many small buildings and few towers. The towers are where the miss is largest, and they are also where the two GIS tables disagree.

## The tall end, and the second source

Planning values are from the comparison CSV. Rockville values are from a separate query of Impervious Surface layer 4, recorded in [data/tall-building-crosscheck.csv](data/tall-building-crosscheck.csv).

| Building | Planning largest part | Game | Rockville layer |
| --- | --- | --- | --- |
| 51 Monroe Place, named MCG / MC Government | 241.63 ft, 73.65 m, one part, base 422.21 ft | 31.74 m | A part named MC Government at that location is 74.36 ft (22.67 m), base 427.94 ft. Other parts in the same envelope are 24–57 ft. |
| 101 Monroe Street, Executive Office Building | 222.89 ft, 67.94 m, base 418.90 ft, year 2012 | 24.31 m | 207.23 ft (63.16 m), base 426.13 ft, flat roof, about 2 m from the Planning centroid. Difference 15.7 ft (4.8 m). |
| 50 Maryland Avenue, Circuit Court | 169.44 ft, 51.65 m | 32.85 m | A Circuit Court part about 22 m away is 84.0 ft (25.6 m). Not proven to be the same polygon. |
| 118 Monroe Street, Americana Centre | 132.06 ft, 40.25 m | 23.44 m | Nearby Rockville parts are 114–137 ft. These are in the same range. |
| 315 N Washington Street | 133.97 ft, 40.83 m | 30.90 m | Not in the Rockville over-80-ft list under this address. Not cross-checked. |
| 808 Hungerford Drive | 20.9 ft, 6.38 m | (in the CSV) | Two unnamed parts in the envelope, 15.4 ft and 19.1 ft, both flat. |

The bases tell a cleaner story than the heights. Planning's 422 ft and 419 ft bases, converted at 0.3048, sit within about 1.3 m of the Maryland bare-earth DEM. Rockville's bases at those spots also sit within about 1 m of the DEM. The elevation columns are feet and are consistent with the ground. The height columns are not consistent with each other at 51 Monroe Place (241 ft versus 74 ft). Possible readings, none of which this audit could prove: a rooftop spike or antenna folded into one Planning polygon, a predominant-roof height in the Rockville copy, or an outright error in one extract. Both copies say source code 5, Captured 2014. The Planning service description says the 3D heights were added from LiDAR and the dataset was created in March 2023. That does not identify which number is the eave.

Until the owner picks a rule, do not call 73.7 m or 22.7 m the height of 51 Monroe Place. A generation pipeline should keep both values and refuse to extrude a height that the two tables contradict by more than a stated tolerance. A 20% tolerance would accept the Executive Office Building pair (about 8%) and reject 51 Monroe Place.

## What "measured" means here

`BLDG_HEIGHT` is an attribute on a 1:1,200 planimetric product. The service text says it comes from LiDAR. This audit did not open the LAS files, so it did not recompute a roof from points. The Maryland services that were opened are bare-earth DEMs. They confirm the ground, not the roof.

Roof form is on the Rockville layer only: 1,631 flat, 202 gable, 1 not applicable, inside the game bounds. The Planning 3D field list does not include roof type even though the description mentions it.

`YEAR_BUILT` is filled, and 577 of 1,865 values in the game bounds are 0. Those are not construction dates. The remaining years run from the 18th century through the 2020s and are usable as an era hint only where they are not 0. One part is coded in the 1750s. That single value was not checked against a historic survey.
