/* AI-assisted: written with the help of Claude (Anthropic) under the project author's direction. */
/* Real satellites that watch fires from orbit (public NASA / USGS mission facts).
 * Shown in the debrief so players can compare their design to the real thing. */
window.REAL_MISSIONS = [
  { name: "Terra (MODIS)", agency: "NASA", launched: "18 Dec 1999", orbit: "705 km, sun-synchronous, 10:30 am pass", swath: "2,330 km", fire: "Fire detection at 1 km pixels, day and night (thermal infrared)" },
  { name: "Aqua (MODIS)", agency: "NASA", launched: "4 May 2002", orbit: "705 km, sun-synchronous, 1:30 pm pass", swath: "2,330 km", fire: "Fire detection at 1 km pixels, day and night (thermal infrared)" },
  { name: "Suomi NPP (VIIRS)", agency: "NASA / NOAA", launched: "28 Oct 2011", orbit: "824 km, sun-synchronous, 1:30 pm pass", swath: "3,040 km", fire: "Fire detection at 375 m pixels: the data behind NASA FIRMS" },
  { name: "Landsat 8", agency: "NASA / USGS", launched: "11 Feb 2013", orbit: "705 km, sun-synchronous, 10:00 am pass", swath: "185 km", fire: "Sharp 30 m images used to map burned areas, but it revisits each place only every 16 days" },
];
window.REAL_MISSIONS_SOURCE = "Public mission facts (NASA, NOAA, USGS). Check the official mission pages for details.";
