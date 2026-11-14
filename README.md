# Mission: Beyond Earth

A space mission game for the 2026 NASA Space Apps Challenge (**Space Mission Design Game**).

You are the flight computer of a small launch rocket. Run the Go/No-Go poll, fly the launch yourself (throttle, pitch, staging, fairing), put the satellite into orbit and release it. The debrief explains how each choice shaped the mission.

**Play:** open `index.html` in a browser, or use the GitHub Pages link.

## Controls
| Key | Action |
| --- | --- |
| W / S | Throttle up / down |
| A / D | Pitch: tip toward vertical / toward horizontal |
| Space | Stage separation |
| F | Drop the fairing |
| R | Arm, then release the satellite |
| V | Cockpit / tracking view |

## The real physics
- Inverse-square gravity, Earth's rotation (launch from Kourou), and an exponential atmosphere with drag.
- Two stages with thrust and efficiency that change with air pressure; numbers are modelled on an Electron-class small launcher (approximate public figures).
- Max Q: dynamic pressure is calculated live; full throttle through the thick air breaks the rocket.
- Orbits: apoapsis and periapsis are computed from the rocket's energy and angular momentum. A two-burn ascent (insert, coast, circularize) reaches a 500 km circular orbit.

## The mission: three steps
1. **Design** EarthWatch-1, a wildfire-watching satellite: camera, solar panels, battery and antenna on a $13.8M budget. Mass feeds the launch.
2. **Launch** it into a polar orbit from the cockpit.
3. **Operate** it for one day (fast-forwarded): a sun-synchronous orbit over Europe, Earth's shadow, battery and safe mode, onboard memory, and downlink passes over Svalbard, Kiruna and Maspalomas. The debrief links each design choice to what happened.

## Fire data (NASA FIRMS)
Operations uses real active-fire detections from NASA FIRMS (VIIRS). Download a Europe CSV from https://firms.modaps.eosdis.nasa.gov/download/ and run `python3 tools/firms_to_json.py fires.csv` to create `data/fires.json`. Without that file the game shows clearly labelled **practice fires** (made-up positions, not real data).

## Credits and data
- Earth day texture (`earth_day_4k.jpg`): [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0, which is based on NASA imagery; taken from the three.js examples (`earth_day_4096.jpg`).
- Earth night lights, clouds and specular textures: from the [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets) (`earth_lights_2048.png`, `earth_clouds_1024.png`, `earth_specular_2048.jpg`).
- 3D engine: [three.js](https://threejs.org) r128 (MIT licence, bundled in `js/vendor/`).
- Fonts: Saira Condensed, IBM Plex Sans and JetBrains Mono (Google Fonts, SIL Open Font Licence).

## Use of AI
Built during the hackathon with help from Claude (Anthropic): AI wrote much of the code (physics, 3D scene, game logic) following the team's game design. The team designed the game concept, the mission flow and screens, wrote the Flight Director lines (`js/lines.js`), and tested and tuned the game.

## Licence
Apache 2.0, see `LICENSE`.
