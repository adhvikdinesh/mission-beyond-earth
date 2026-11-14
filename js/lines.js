/* Flight Director lines.
 * Edit these to change what the Flight Director says at each moment.
 * Keep each line short: one or two sentences.
 */
window.LINES = {
  design: "Commander, before we fly, design the satellite. Every part costs money, mass and power. Choose wisely.",
  prelaunch: "Good morning, Commander. We're on the pad at Kourou. Run the Go/No-Go poll before we light the engines.",
  countdown: "Final countdown. All systems are GO. Stand by for ignition.",
  pollDone: "All stations are GO. Launch when ready, then push the throttle up to lift off.",
  liftoffWeak: "Engines are lit, but we're not moving. Thrust must be stronger than the rocket's weight. More throttle!",
  liftoff: "Liftoff! We have cleared the tower.",
  maxqWarn: "Max Q is coming: the air is pushing hardest on the rocket now. Throttle down to about 70% to protect it.",
  maxqPassed: "Max Q passed. You can go back to full throttle.",
  turn: "Start the gravity turn. Follow the green marker: to reach orbit you need to go sideways, not just up.",
  turnAuto: "Gravity turn started. The autopilot is tipping us over: to reach orbit we must go sideways, not just up.",
  stageReady: "Stage 1 is empty. Press STAGE to drop it and light the second stage.",
  stageNag: "Commander, stage 1 is still attached and empty! We're falling. STAGE now: press Space.",
  staged: "Stage separation confirmed. Second stage ignition!",
  fairingReady: "We're above the thick air. Press FAIRING to drop the nose cone.",
  fairingDone: "Fairing away. Our satellite can see space for the first time.",
  apoReady: "Apoapsis has reached our target height. Cut the engine now.",
  coast: "Engine off. We're coasting up to the highest point. Use time warp to get there faster.",
  circReady: "We're at the top of the orbit. Burn sideways to raise the low point and make the orbit round.",
  orbit: "Orbit confirmed! We are going around the Earth. Get ready to release the satellite.",
  release: "Satellite released! It's flying on its own now. Great work, Commander.",
  ops: "Now the real mission starts. Watch one day in orbit: find the fires, survive Earth's shadow, and send the photos home.",
  fail: {
    maxq: "The air pressure was too strong at full throttle. The rocket broke apart at Max Q.",
    ground: "We hit the ground. The rocket turned too far, too early.",
    reentry: "We fell back into the atmosphere at orbital speed and burned up.",
    suborbital: "We ran out of fuel before reaching orbital speed. The rocket is falling back to Earth.",
    nostage: "The empty first stage was never dropped. The second stage never lit and we fell back to Earth.",
    fairing: "The fairing came off while the air was still thick. The satellite overheated.",
  },
};
