/* AI-assisted: written with the help of Claude (Anthropic) under the project author's direction. */
/* Mission: Beyond Earth — the mission and the spacecraft parts catalogue.
 * Numbers are game values chosen to be in the range of real small satellites.
 */
(function () {
  "use strict";
  const M = {};

  M.MISSION = {
    name: "EarthWatch-1",
    goal: "Find wildfires in Spain and Portugal from orbit and send the pictures to firefighters on the ground.",
    target: 500000,            // m, circular polar orbit
    budget: 13.8,              // $ million in total
    launchCost: 7.5,           // $ million, Lynx-2 launch
    region: { latMin: 35.5, latMax: 44.2, lonMin: -9.8, lonMax: 4.5 },
  };

  M.BUS = { name: "Satellite body", mass: 60, power: 30, cost: 3.0, storageMB: 4000,
    note: "Structure, computer, attitude control and command radio. Always included." };

  // imageMB: megabytes recorded per minute of filming
  M.PARTS = {
    camera: {
      label: "Camera", options: [
        { id: "thermal", name: "Thermal infrared imager", mass: 18, power: 35, cost: 1.4, swathKm: 300, imageMB: 60, night: true, detect: 0.95,
          why: "Sees the heat of fires day and night, and through smoke. Its cooler needs power all the time." },
        { id: "colour", name: "Colour camera", mass: 9, power: 15, cost: 0.6, swathKm: 180, imageMB: 30, night: false, detect: 0.7,
          why: "Cheaper and lighter, but only works in daylight and smoke can hide fires." },
      ] },
    solar: {
      label: "Solar panels", options: [
        { id: "two", name: "2 solar panels", mass: 12, cost: 0.4, watts: 80, why: "Light and cheap, 80 W in sunlight." },
        { id: "four", name: "4 solar panels", mass: 22, cost: 0.8, watts: 160, why: "160 W in sunlight: plenty of spare power." },
      ] },
    battery: {
      label: "Battery", options: [
        { id: "small", name: "Small battery", mass: 6, cost: 0.2, wh: 40, why: "40 Wh: enough for the basics in Earth's shadow." },
        { id: "large", name: "Large battery", mass: 14, cost: 0.5, wh: 120, why: "120 Wh: keeps the camera running through Earth's shadow." },
      ] },
    antenna: {
      label: "Downlink antenna", options: [
        { id: "sband", name: "S-band antenna", mass: 4, power: 10, cost: 0.3, mbps: 1, why: "1 Mbit/s: sends about 75 MB per ground-station pass." },
        { id: "xband", name: "X-band antenna", mass: 8, power: 25, cost: 0.8, mbps: 50, why: "50 Mbit/s: sends about 3,700 MB per pass, more than the camera records." },
      ] },
  };

  M.defaultDesign = () => ({ camera: "colour", solar: "two", battery: "small", antenna: "sband" });

  M.part = (slot, id) => M.PARTS[slot].options.find((o) => o.id === id);

  /** Totals and engineering checks for a design. */
  M.evaluate = function (d) {
    const cam = M.part("camera", d.camera), sol = M.part("solar", d.solar), bat = M.part("battery", d.battery), ant = M.part("antenna", d.antenna);
    const mass = M.BUS.mass + cam.mass + sol.mass + bat.mass + ant.mass;
    const cost = M.BUS.cost + cam.cost + sol.cost + bat.cost + ant.cost + M.MISSION.launchCost;
    const shadowMin = 36;                                              // minutes in Earth's shadow per orbit at ~500 km
    const nightLoad = M.BUS.power + (cam.night ? cam.power : 0);       // the thermal camera's cooler never switches off
    const nightWh = nightLoad * shadowMin / 60;
    const usableWh = bat.wh * 0.8;
    const sunLoad = M.BUS.power + (cam.night ? cam.power : cam.power * 0.25) + ant.power * 0.15;
    const recharge = sol.watts - sunLoad;                               // spare watts in sunlight to refill the battery
    const perPassMB = ant.mbps / 8 * 10 * 60;                           // a 10-minute ground-station pass
    const recordMB = cam.imageMB * 13;                                  // about 13 minutes filming Europe per orbit
    const checks = [];
    if (cost > M.MISSION.budget + 1e-9) checks.push({ level: "bad", text: `Over budget by $${(cost - M.MISSION.budget).toFixed(1)}M. Swap a part for a cheaper one.` });
    if (nightWh > usableWh) checks.push({ level: "warn", text: `In Earth's shadow the satellite needs ${Math.round(nightWh)} Wh but the battery gives ${Math.round(usableWh)} Wh. It will shut the camera down at night.` });
    if (recharge < 20) checks.push({ level: "warn", text: `Only ${Math.round(recharge)} W spare in sunlight to recharge the battery.` });
    if (perPassMB < recordMB) checks.push({ level: "warn", text: `The camera records about ${recordMB} MB per orbit but the antenna sends about ${Math.round(perPassMB)} MB per pass. Pictures will pile up on board.` });
    if (!cam.night) checks.push({ level: "info", text: "The colour camera can't see fires at night or through thick smoke." });
    if (mass > 140) checks.push({ level: "warn", text: `${mass} kg is heavy for the Lynx-2: less fuel to spare in orbit.` });
    return { cam, sol, bat, ant, mass, cost, nightWh, usableWh, recharge, perPassMB, recordMB, checks, ok: cost <= M.MISSION.budget + 1e-9 };
  };

  window.MissionData = M;
})();
