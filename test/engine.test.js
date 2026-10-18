"use strict";
var test = require("node:test");
var assert = require("node:assert");
var E = require("../src/engine.js");

test("energy is watts over 1000 times hours", function () {
  // A 2000 W kettle run 0.5 h a day = 1 kWh a day.
  var e = E.applianceEnergy({ watts: 2000, hoursPerDay: 0.5 });
  assert.strictEqual(e.activeKwhDay, 1);
  assert.strictEqual(e.kwhYear, 365);
});

test("cost is energy times the unit rate", function () {
  // 1 kWh/day at 0.30 a unit = 0.30/day, 109.50/year.
  var c = E.applianceCost({ watts: 1000, hoursPerDay: 1 }, 0.3);
  assert.strictEqual(E.round(c.costDay), 0.3);
  assert.strictEqual(E.round(c.costYear), 109.5);
});

test("standby only fills the hours the thing is not in use", function () {
  // On 2 h a day at 100 W, standby 3 W for the other 22 h.
  var e = E.applianceEnergy({ watts: 100, hoursPerDay: 2, standbyWatts: 3 });
  assert.strictEqual(e.activeHoursPerDay, 2);
  assert.strictEqual(e.standbyHoursPerDay, 22);
  assert.strictEqual(E.round(e.activeKwhDay, 3), 0.2);
  assert.strictEqual(E.round(e.standbyKwhDay, 3), 0.066);
});

test("no standby watts means no standby energy", function () {
  var e = E.applianceEnergy({ watts: 100, hoursPerDay: 2 });
  assert.strictEqual(e.standbyKwhDay, 0);
});

test("hours per week are spread across seven days", function () {
  // Oven used 7 h a week should match 1 h a day.
  var weekly = E.applianceEnergy({ watts: 2100, hoursPerWeek: 7 });
  var daily = E.applianceEnergy({ watts: 2100, hoursPerDay: 1 });
  assert.strictEqual(E.round(weekly.kwhYear), E.round(daily.kwhYear));
});

test("quantity multiplies the whole appliance", function () {
  var one = E.applianceCost({ watts: 10, hoursPerDay: 24, quantity: 1 }, 0.3);
  var four = E.applianceCost({ watts: 10, hoursPerDay: 24, quantity: 4 }, 0.3);
  assert.strictEqual(E.round(four.costYear), E.round(one.costYear * 4));
});

test("hours are clamped to a real day", function () {
  var e = E.applianceEnergy({ watts: 1000, hoursPerDay: 30 });
  assert.strictEqual(e.activeHoursPerDay, 24);
  assert.strictEqual(e.standbyHoursPerDay, 0);
});

test("negative inputs are floored, not trusted", function () {
  var c = E.applianceCost({ watts: -500, hoursPerDay: -3 }, -0.2);
  assert.strictEqual(c.costYear, 0);
});

test("bill sorts appliances dearest first", function () {
  var s = E.billSummary([
    { name: "LED bulb", watts: 8, hoursPerDay: 5 },
    { name: "Fridge", watts: 100, hoursPerDay: 8 },
    { name: "Dryer", watts: 2500, hoursPerWeek: 4 }
  ], { unitRate: 0.3 });
  assert.strictEqual(s.appliances[0].name, "Dryer");
  assert.strictEqual(s.appliances[2].name, "LED bulb");
});

test("standing charge is counted apart from running cost", function () {
  var s = E.billSummary([{ name: "Fridge", watts: 100, hoursPerDay: 24 }], {
    unitRate: 0.3,
    standingChargeDay: 0.6
  });
  assert.strictEqual(E.round(s.standingChargeYear), 219); // 0.60 * 365
  assert.strictEqual(E.round(s.totalYear), E.round(s.runningCostYear + s.standingChargeYear));
  assert.ok(s.standingChargeShare > 0 && s.standingChargeShare < 1);
});

test("standby share of the running cost is reported", function () {
  var s = E.billSummary([
    { name: "TV", watts: 120, hoursPerDay: 4, standbyWatts: 10 }
  ], { unitRate: 0.3 });
  assert.ok(s.standbyCostYear > 0);
  assert.ok(s.standbyShare > 0 && s.standbyShare < 1);
});

test("the biggest few cover at least 80% of the running cost", function () {
  var s = E.billSummary([
    { name: "Heater", watts: 2000, hoursPerDay: 3 },
    { name: "Fridge", watts: 100, hoursPerDay: 24 },
    { name: "Router", watts: 10, hoursPerDay: 24 },
    { name: "Clock", watts: 2, hoursPerDay: 24 }
  ], { unitRate: 0.3 });
  var covered = s.biggest.reduce(function (sum, c) { return sum + c.costYear; }, 0);
  assert.ok(covered >= s.runningCostYear * 0.8);
  assert.ok(s.biggest.length < s.appliances.length);
});

test("an empty list gives zeroes, not errors", function () {
  var s = E.billSummary([], { unitRate: 0.3, standingChargeDay: 0.5 });
  assert.strictEqual(s.runningCostYear, 0);
  assert.strictEqual(s.standbyShare, 0);
  assert.strictEqual(E.round(s.totalYear), 182.5);
});

test("carbon: kWh times the grid factor, and a driving comparison", function () {
  // A 1000 W heater on 1 h a day = 1 kWh/day = 365 kWh/year.
  // At 0.21 kg CO2/kWh that is 76.65 kg a year.
  var s = E.billSummary([{ name: "Heater", watts: 1000, hoursPerDay: 1 }], { unitRate: 0.3, co2PerKwh: 0.21 });
  assert.ok(Math.abs(s.co2Year - 76.65) < 1e-6);
  assert.ok(Math.abs(s.appliances[0].co2Year - 76.65) < 1e-6);
  // 76.65 kg / 0.4 kg per mile = 191.625 miles.
  assert.ok(Math.abs(s.drivingMilesYear - 191.625) < 1e-6);
});

test("no carbon factor means no carbon numbers, not a crash", function () {
  var s = E.billSummary([{ name: "Lamp", watts: 60, hoursPerDay: 5 }], { unitRate: 0.3 });
  assert.strictEqual(s.co2Year, 0);
  assert.strictEqual(s.drivingMilesYear, 0);
  assert.strictEqual(s.appliances[0].co2Year, 0);
});

test("carbon scales with the whole list", function () {
  var items = [{ watts: 1000, hoursPerDay: 1 }, { watts: 1000, hoursPerDay: 1 }];
  var s = E.billSummary(items, { unitRate: 0.3, co2PerKwh: 0.37 });
  var one = E.billSummary([items[0]], { unitRate: 0.3, co2PerKwh: 0.37 });
  assert.ok(Math.abs(s.co2Year - one.co2Year * 2) < 1e-6);
});
