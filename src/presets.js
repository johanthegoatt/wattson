// A short list of common things and the sort of power they pull, so you can
// start with a close guess and then change it to match your own. These are
// typical figures, not your exact model: the label on the plug or the maker's
// page beats any of these. Standby figures lean on the finding that tellies,
// set-top boxes and printers are the quiet ones that cost most when left on.
//
// watts        = power while in use
// standbyWatts = power while plugged in but not in use (0 if you unplug it)
// hoursPerDay  = a rough daily "on" time; hoursPerWeek for things used now and
//                then, which Wattson spreads across the week.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WattsonPresets = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PRESETS = [
    { name: "Fridge-freezer", watts: 150, standbyWatts: 0, hoursPerDay: 8, note: "cycles on and off; this is a typical daily average" },
    { name: "Electric kettle", watts: 2200, standbyWatts: 0, hoursPerDay: 0.2 },
    { name: "Electric oven", watts: 2100, standbyWatts: 1, hoursPerWeek: 4 },
    { name: "Microwave", watts: 900, standbyWatts: 3, hoursPerDay: 0.2, note: "the clock is the standby draw" },
    { name: "Washing machine", watts: 700, standbyWatts: 1, hoursPerWeek: 4 },
    { name: "Tumble dryer", watts: 2500, standbyWatts: 1, hoursPerWeek: 3 },
    { name: "Dishwasher", watts: 1200, standbyWatts: 1, hoursPerWeek: 7 },
    { name: "Electric shower", watts: 8500, standbyWatts: 0, hoursPerDay: 0.17 },
    { name: "Television", watts: 80, standbyWatts: 8, hoursPerDay: 4, note: "older sets and ones with a box can idle at 10 W or more" },
    { name: "Set-top box / recorder", watts: 18, standbyWatts: 16, hoursPerDay: 4, note: "famous for drawing nearly as much off as on" },
    { name: "Games console", watts: 150, standbyWatts: 10, hoursPerDay: 2, note: "rest or instant-on modes keep it awake" },
    { name: "Desktop PC", watts: 150, standbyWatts: 3, hoursPerDay: 4 },
    { name: "Laptop", watts: 50, standbyWatts: 1, hoursPerDay: 6 },
    { name: "Broadband router", watts: 10, standbyWatts: 0, hoursPerDay: 24, note: "on all the time by design" },
    { name: "LED bulb", watts: 8, standbyWatts: 0, hoursPerDay: 5, quantity: 1 },
    { name: "Space heater", watts: 2000, standbyWatts: 0, hoursPerDay: 3, weeksPerYear: 17, note: "usually only the cold months" },
    { name: "Air conditioner", watts: 1000, standbyWatts: 2, hoursPerDay: 5, weeksPerYear: 17, note: "usually only the warm months" },
    { name: "Phone charger", watts: 10, standbyWatts: 0.3, hoursPerDay: 2, note: "the trickle it pulls left in the wall is tiny but never stops" }
  ];

  return { PRESETS: PRESETS };
});
