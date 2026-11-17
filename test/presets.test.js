"use strict";
var test = require("node:test");
var assert = require("node:assert");
var P = require("../src/presets.js").PRESETS;

test("every preset is well-formed and uses one usage spec", function () {
  assert.ok(Array.isArray(P) && P.length > 0);
  P.forEach(function (a) {
    assert.ok(a.name && typeof a.name === "string", "has a name");
    assert.ok(a.watts > 0, a.name + " has positive watts");
    assert.ok(a.standbyWatts >= 0, a.name + " has non-negative standby");
    // Exactly one way of saying how much it's used.
    var ways = [a.hoursPerDay != null, a.hoursPerWeek != null, (a.runsPerWeek != null && a.hoursPerRun != null)]
      .filter(Boolean).length;
    assert.strictEqual(ways, 1, a.name + " names one usage spec");
  });
});

test("the newly added appliances are present", function () {
  var names = P.map(function (a) { return a.name; });
  ["Hair dryer", "Toaster", "Air fryer", "Vacuum cleaner", "Slow cooker", "Electric blanket",
   "Immersion heater", "Dehumidifier", "Chest / upright freezer", "Electric car (home charge)"].forEach(function (n) {
    assert.ok(names.indexOf(n) >= 0, "has " + n);
  });
});
