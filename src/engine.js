// Wattson cost engine. Pure functions, no DOM, so the tests can run in Node.
//
// The whole thing rests on one line people mix up: power times time is energy,
// and energy times the unit rate is money.
//
//   energy (kWh) = watts / 1000 * hours
//   cost         = energy (kWh) * unit rate (per kWh)
//
// Two things trip people up and both show up in the numbers here:
//   1. Standby. A thing that is "off" but still plugged in draws a trickle all
//      year. That trickle is small per hour and large per year.
//   2. The standing charge. You pay it every day no matter what you switch off,
//      so it is kept apart from the running cost, never folded in.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WattsonEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAYS_PER_YEAR = 365;
  var WEEKS_PER_YEAR = 52;

  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) return fallback === undefined ? 0 : fallback;
    return n;
  }

  function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function round(n, dp) {
    var f = Math.pow(10, dp === undefined ? 2 : dp);
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  // How many hours a day a thing is actually switched on. Accepts either
  // hoursPerDay directly, or hoursPerWeek which we spread across seven days so
  // a "twice a week" oven is counted honestly, not as if it ran every day.
  function activeHoursPerDay(a) {
    if (a.hoursPerWeek != null && a.hoursPerDay == null) {
      return clamp(num(a.hoursPerWeek) / 7, 0, 24);
    }
    return clamp(num(a.hoursPerDay), 0, 24);
  }

  // Energy for one appliance, split into the part you meant to use (active)
  // and the part you did not (standby). Standby only fills the hours the thing
  // is not in active use, and only if it is left plugged in.
  function applianceEnergy(a) {
    var qty = Math.max(1, Math.round(num(a.quantity, 1)));
    var watts = Math.max(0, num(a.watts));
    var standbyWatts = a.standbyWatts == null ? 0 : Math.max(0, num(a.standbyWatts));
    var activeH = activeHoursPerDay(a);
    var standbyH = clamp(24 - activeH, 0, 24);

    // Seasonal things (a heater, a fan, an air conditioner) only run part of the
    // year. weeksPerYear scales the yearly figures without touching the in-use
    // day, so a heater on for 17 weeks isn't costed as if it ran in July too.
    var weeksPerYear = a.weeksPerYear == null ? 52 : clamp(num(a.weeksPerYear, 52), 0, 52);
    var daysPerYear = DAYS_PER_YEAR * (weeksPerYear / 52);

    var activeKwhDay = (watts / 1000) * activeH * qty;
    var standbyKwhDay = (standbyWatts / 1000) * standbyH * qty;
    var kwhDay = activeKwhDay + standbyKwhDay;

    return {
      quantity: qty,
      activeHoursPerDay: activeH,
      standbyHoursPerDay: standbyH,
      weeksPerYear: weeksPerYear,
      daysPerYear: daysPerYear,
      activeKwhDay: activeKwhDay,
      standbyKwhDay: standbyKwhDay,
      kwhDay: kwhDay,
      kwhYear: kwhDay * daysPerYear
    };
  }

  // Add money to the energy numbers for one appliance at a given unit rate.
  function applianceCost(a, unitRate) {
    var rate = Math.max(0, num(unitRate));
    var e = applianceEnergy(a);
    var costDay = e.kwhDay * rate;
    var standbyCostYear = e.standbyKwhDay * e.daysPerYear * rate;
    return {
      name: a.name || "This",
      energy: e,
      costDay: costDay,
      costMonth: (e.kwhYear * rate) / 12,
      costYear: e.kwhYear * rate,
      standbyCostYear: standbyCostYear,
      standbyShare: e.kwhYear > 0 ? (e.standbyKwhDay * e.daysPerYear) / e.kwhYear : 0
    };
  }

  // Carbon from a year of electricity: kWh times the grid's emission factor
  // (kg CO2e per kWh). About 0.4 kg of CO2 comes out of a petrol car for each
  // mile, so a year's kWh turns into an easy "that's like driving X miles"
  // (US EPA: a typical passenger car emits about 400 g CO2 per mile).
  var KG_CO2_PER_MILE = 0.4;

  function drivingMilesForCo2(kg) {
    return Math.max(0, num(kg)) / KG_CO2_PER_MILE;
  }

  // The whole picture: every appliance costed and sorted dearest first, the
  // running total, the standby total, the standing charge kept on its own, and
  // the carbon if a grid emission factor is given.
  function billSummary(appliances, opts) {
    opts = opts || {};
    var rate = Math.max(0, num(opts.unitRate));
    var standingDay = Math.max(0, num(opts.standingChargeDay));
    var co2Factor = Math.max(0, num(opts.co2PerKwh));

    // Economy 7 and the like charge a cheaper rate for a block of night hours.
    // If a night rate is given, each appliance can mark the share of its energy
    // it runs on that cheap rate (a dishwasher on a timer is 1, a fridge that
    // runs all day is a fraction), and its cost uses a blend of the two rates.
    // With no night rate, nothing changes and the single-rate numbers stand.
    var nightRate = opts.nightRate == null || opts.nightRate === "" ? null : Math.max(0, num(opts.nightRate));
    var nightRateUsed = nightRate != null;

    var list = (appliances || [])
      .map(function (a) {
        var c = applianceCost(a, rate);
        c.co2Year = c.energy.kwhYear * co2Factor;
        c.dayCostYear = c.costYear; // the figure if it all ran on the day rate
        if (nightRateUsed) {
          var ns = clamp(num(a.nightShare, 0), 0, 1);
          var blended = ns * nightRate + (1 - ns) * rate;
          c.nightShare = ns;
          c.blendedRate = blended;
          c.costDay = c.energy.kwhDay * blended;
          c.costYear = c.energy.kwhYear * blended;
          c.costMonth = c.costYear / 12;
          c.standbyCostYear = c.energy.standbyKwhDay * c.energy.daysPerYear * blended;
        }
        return c;
      })
      .sort(function (x, y) { return y.costYear - x.costYear; });

    var runningYear = list.reduce(function (s, c) { return s + c.costYear; }, 0);
    var standbyYear = list.reduce(function (s, c) { return s + c.standbyCostYear; }, 0);
    var kwhYear = list.reduce(function (s, c) { return s + c.energy.kwhYear; }, 0);
    var co2Year = kwhYear * co2Factor;
    var standingYear = standingDay * DAYS_PER_YEAR;
    var totalYear = runningYear + standingYear;

    // What the running cost would be with everything on the day rate, and so
    // how much the night rate is saving across the year. Zero when no night
    // rate is set, or when nothing is marked as running overnight.
    var runningYearDayRate = list.reduce(function (s, c) { return s + c.dayCostYear; }, 0);
    var economySavingYear = nightRateUsed ? runningYearDayRate - runningYear : 0;

    // The few things that make up most of the running cost. Walk the sorted
    // list until we pass 80% of the running total; those are the ones worth
    // acting on first.
    var biggest = [];
    var acc = 0;
    for (var i = 0; i < list.length && runningYear > 0; i++) {
      biggest.push(list[i]);
      acc += list[i].costYear;
      if (acc >= runningYear * 0.8) break;
    }

    return {
      appliances: list,
      biggest: biggest,
      unitRate: rate,
      kwhYear: kwhYear,
      runningCostYear: runningYear,
      runningCostMonth: runningYear / 12,
      standbyCostYear: standbyYear,
      standbyShare: runningYear > 0 ? standbyYear / runningYear : 0,
      standingChargeYear: standingYear,
      standingChargeShare: totalYear > 0 ? standingYear / totalYear : 0,
      nightRate: nightRate,
      nightRateUsed: nightRateUsed,
      runningCostYearDayRate: runningYearDayRate,
      economySavingYear: economySavingYear,
      totalYear: totalYear,
      totalMonth: totalYear / 12,
      co2Year: co2Year,
      co2FactorPerKwh: co2Factor,
      drivingMilesYear: drivingMilesForCo2(co2Year)
    };
  }

  return {
    DAYS_PER_YEAR: DAYS_PER_YEAR,
    WEEKS_PER_YEAR: WEEKS_PER_YEAR,
    KG_CO2_PER_MILE: KG_CO2_PER_MILE,
    activeHoursPerDay: activeHoursPerDay,
    applianceEnergy: applianceEnergy,
    applianceCost: applianceCost,
    billSummary: billSummary,
    drivingMilesForCo2: drivingMilesForCo2,
    round: round
  };
});
