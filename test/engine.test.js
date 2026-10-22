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

// ---- Economy 7 / night rate ----

test("with no night rate, the numbers are unchanged", function () {
  var s = E.billSummary([{ name: "x", watts: 1000, hoursPerDay: 1 }], { unitRate: 0.30 });
  assert.strictEqual(s.nightRateUsed, false);
  assert.strictEqual(s.economySavingYear, 0);
  // 1 kWh/day * 365 * 0.30 = 109.5
  assert.strictEqual(E.round(s.runningCostYear), 109.5);
});

test("an appliance run fully on the night rate costs the night rate", function () {
  var app = { name: "dishwasher", watts: 1000, hoursPerDay: 1, nightShare: 1 };
  var s = E.billSummary([app], { unitRate: 0.30, nightRate: 0.10 });
  assert.strictEqual(s.nightRateUsed, true);
  assert.strictEqual(E.round(s.runningCostYear), E.round(365 * 0.10)); // 36.5
  // saving vs day rate: 365 kWh * (0.30 - 0.10) = 73
  assert.strictEqual(E.round(s.economySavingYear), 73);
  assert.strictEqual(E.round(s.runningCostYearDayRate), 109.5);
});

test("a half-and-half night share blends the two rates", function () {
  var app = { name: "mix", watts: 1000, hoursPerDay: 1, nightShare: 0.5 };
  var s = E.billSummary([app], { unitRate: 0.30, nightRate: 0.10 });
  // blended rate 0.20 -> 365 * 0.20 = 73
  assert.strictEqual(E.round(s.runningCostYear), 73);
  assert.strictEqual(E.round(s.economySavingYear), 36.5);
});

test("night share is clamped to 0..1 and missing means day rate", function () {
  var over = E.billSummary([{ watts: 1000, hoursPerDay: 1, nightShare: 5 }], { unitRate: 0.30, nightRate: 0.10 });
  assert.strictEqual(E.round(over.runningCostYear), 36.5); // treated as 1
  var none = E.billSummary([{ watts: 1000, hoursPerDay: 1 }], { unitRate: 0.30, nightRate: 0.10 });
  assert.strictEqual(E.round(none.runningCostYear), 109.5); // nightShare 0 -> day rate
  assert.strictEqual(none.economySavingYear, 0);
});

test("standby cost also follows the blended rate under a night tariff", function () {
  var app = { name: "tv", watts: 100, hoursPerDay: 4, standbyWatts: 10, nightShare: 1 };
  var day = E.billSummary([app], { unitRate: 0.30 });
  var night = E.billSummary([app], { unitRate: 0.30, nightRate: 0.10 });
  assert.ok(night.standbyCostYear < day.standbyCostYear);
  assert.strictEqual(E.round(night.standbyCostYear), E.round(day.standbyCostYear / 3));
});

test("a year-round appliance is unchanged (52 weeks is the default)", function () {
  var withNone = E.applianceEnergy({ watts: 1000, hoursPerDay: 1 });
  var with52 = E.applianceEnergy({ watts: 1000, hoursPerDay: 1, weeksPerYear: 52 });
  assert.strictEqual(withNone.kwhYear, with52.kwhYear);
  assert.strictEqual(withNone.weeksPerYear, 52);
});

test("a seasonal heater used half the year costs about half as much a year", function () {
  var allYear = E.applianceCost({ watts: 2000, hoursPerDay: 4 }, 0.3);
  var halfYear = E.applianceCost({ watts: 2000, hoursPerDay: 4, weeksPerYear: 26 }, 0.3);
  // The in-use day is the same; the year is scaled by 26/52.
  assert.strictEqual(halfYear.costDay, allYear.costDay);
  assert.ok(Math.abs(halfYear.costYear - allYear.costYear / 2) < 1e-9);
});

test("standby is scaled by the season too", function () {
  var c = E.applianceCost({ watts: 1500, hoursPerDay: 3, standbyWatts: 2, weeksPerYear: 13 }, 0.3);
  var full = E.applianceCost({ watts: 1500, hoursPerDay: 3, standbyWatts: 2 }, 0.3);
  assert.ok(Math.abs(c.standbyCostYear - full.standbyCostYear / 4) < 1e-9);
});

test("weeks per year is clamped to a real range", function () {
  assert.strictEqual(E.applianceEnergy({ watts: 10, hoursPerDay: 1, weeksPerYear: 200 }).weeksPerYear, 52);
  assert.strictEqual(E.applianceEnergy({ watts: 10, hoursPerDay: 1, weeksPerYear: -5 }).weeksPerYear, 0);
});
