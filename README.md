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

## Credits and data
- Earth textures: based on NASA Blue Marble and Earth at Night (Black Marble) imagery, NASA Earth Observatory / Visible Earth.
- 3D engine: [three.js](https://threejs.org) r128 (MIT licence, bundled in `js/vendor/`).
- Fonts: Saira Condensed, IBM Plex Sans and JetBrains Mono (Google Fonts, SIL Open Font Licence).

## Use of AI
Built during the hackathon with help from Claude (Anthropic): AI wrote much of the code (physics, 3D scene, game logic) following the team's game design. The team designed the game concept, the mission flow and screens, wrote the Flight Director lines (`js/lines.js`), and tested and tuned the game.

## Licence
Apache 2.0, see `LICENSE`.
