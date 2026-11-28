# Touch controller

The touchscreen overlay follows the standard Xbox arrangement across the game view. Enter downtown and hold the left stick to move. The right stick turns the third-person camera. Hold LT to aim and RT to fire. Tap **Controls** to open the settings.

## Mapping

Touch and standard physical gamepads use the same button identifiers, action edges and game logic.

| Control | Action |
| --- | --- |
| Left stick | Analog movement |
| Right stick | Camera look |
| LT | Hold to aim |
| RT | Fire. Automatic weapons repeat while held. Semiautomatic weapons use a new press for each shot. |
| A | Jump. Restart on the game-over screen. |
| X | Reload |
| Y | Interact with a machine |
| RB or D-pad Right | Next weapon |
| D-pad Left | Previous weapon |
| L3 | Hold to sprint with forward movement |
| R3 | Switch camera shoulder |
| Menu | Pause or resume. Restart on the game-over screen. |
| B, LB, View, D-pad Up and Down | Unassigned, following the existing physical bindings |

Keyboard and mouse controls retain the existing bindings. A connected physical gamepad takes over on active input when no touches are held. Touching the game restores the overlay. The **Use touch controls** button also restores it. A held physical button does not create a second action when the source changes.

## Touch layout and settings

The analog sticks use independent pointer capture and radial dead zones. A button tap is retained until the next game update, even when both the down and up events arrive between rendered frames. A canceled pointer releases its own input. Blur, backgrounding, settings, and orientation changes release active touches.

The **Controls** panel adjusts opacity, button and stick size, separate movement and camera dead zones, horizontal and vertical sensitivity, and aiming sensitivity. Position sliders move the selected group. Portrait and landscape positions are saved separately. Settings persist on the current browser origin, and **Restore defaults** resets them.

The HUD keeps health, round, weapon, ammunition and points in a compact band. Touch aiming uses a clearer reticle, a slightly wider field of view, and a farther offset from the character. Third-person camera collision and shoulder switching still use the existing camera boom.

## Browser gestures

The active surface and controller block selection, long-press callouts, dragging, context menus, and double-tap, pinch and scroll gestures when the browser exposes them to the page. The settings dialog remains scrollable and keeps normal form controls. The page does not set a global maximum zoom.

**Fit screen** fits the view to the visible viewport if browser zoom or panning has shifted it. It preserves the current round and layout settings. A browser can retain its own zoom level. While paused, pinch inward on an area outside the gameplay controls to reset browser zoom.

Physical iOS Safari and Android Chrome verification is still required. Chromium touch emulation can validate pointer routing, cancellation, layout and visual viewport changes. Browser-owned Safari gestures, physical touch latency, safe-area rendering on a specific device, and phone frame pacing require a device session.
