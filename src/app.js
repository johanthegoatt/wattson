// Wattson's wiring. Holds the list of things, recomputes on every keystroke,
// draws the total and the breakdown, and keeps Watt in the loop. Nothing is
// sent anywhere: the share link carries the whole list in the address itself.
(function () {
  "use strict";
  var E = window.WattsonEngine;
  var P = (window.WattsonPresets && window.WattsonPresets.PRESETS) || [];
  var Watt = window.Watt || { react: function () {}, context: function () {}, say: function () {} };

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $("rows");
  var tpl = $("row-tpl");
  var presetSel = $("preset");
  var curPick = $("cur-pick");
  var rateEl = $("rate");
  var standingEl = $("standing");
  var nightEl = $("night-rate");

  var currency = "$";
  var items = []; // { el, name, watts, hours, standby, qty }

  // ---- money ----
  function money(n) {
    var abs = Math.abs(n);
    var dp = abs > 0 && abs < 1 ? 2 : abs < 100 ? 2 : 0;
    return currency + n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function moneyPrecise(n) {
    return currency + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setCurrency(c) {
    currency = c || "$";
    Array.prototype.forEach.call(document.querySelectorAll(".cur"), function (i) { i.textContent = currency; });
  }

  // Grid carbon, kg CO2e per kWh, chosen from the currency as a rough stand-in
  // for where you are. Published averages: UK ~0.21 (DESNZ 2024), US ~0.37
  // (EPA eGRID), euro area ~0.25 (EEA), Philippines ~0.65 (coal-heavy grid).
  // The $ default leans to the US figure.
  var CO2_BY_CUR = { "£": 0.21, "$": 0.37, "€": 0.25, "₱": 0.65 };
  function co2Factor() { return CO2_BY_CUR[currency] || 0.37; }

  // ---- rows ----
  function addItem(data) {
    data = data || {};
    var node = tpl.content.firstElementChild.cloneNode(true);
    var item = { el: node };
    var fields = {
      name: node.querySelector(".a-name"),
      watts: node.querySelector(".a-watts"),
      hours: node.querySelector(".a-hours"),
      standby: node.querySelector(".a-standby"),
      qty: node.querySelector(".a-qty"),
      night: node.querySelector(".a-night")
    };
    item.fields = fields;
    item.nightWrap = node.querySelector(".a-night-wrap");
    item.costEl = node.querySelector(".a-cost");

    fields.name.value = data.name || "";
    fields.watts.value = data.watts != null ? data.watts : "";
    // hoursPerWeek presets are shown as a daily figure people can read.
    var h = data.hoursPerDay != null ? data.hoursPerDay
      : data.hoursPerWeek != null ? Math.round((data.hoursPerWeek / 7) * 100) / 100 : "";
    fields.hours.value = h;
    fields.standby.value = data.standbyWatts != null ? data.standbyWatts : "";
    fields.qty.value = data.quantity != null ? data.quantity : "";
    fields.night.checked = !!data.nightShare;

    ["name", "watts", "hours", "standby", "qty"].forEach(function (k) {
      fields[k].addEventListener("input", recompute);
    });
    fields.night.addEventListener("change", recompute);
    fields.standby.addEventListener("change", function () {
      if (parseFloat(fields.standby.value) > 0) Watt.react("standby");
    });

    node.querySelector(".a-remove").addEventListener("click", function () {
      var i = items.indexOf(item);
      if (i >= 0) items.splice(i, 1);
      node.remove();
      Watt.react("removed");
      recompute();
    });

    items.push(item);
    rowsEl.appendChild(node);
    return item;
  }

  function readItem(item) {
    var f = item.fields;
    return {
      name: f.name.value.trim() || "This",
      watts: parseFloat(f.watts.value) || 0,
      hoursPerDay: f.hours.value === "" ? 0 : parseFloat(f.hours.value) || 0,
      standbyWatts: f.standby.value === "" ? 0 : parseFloat(f.standby.value) || 0,
      quantity: parseInt(f.qty.value, 10) || 1,
      nightShare: f.night && f.night.checked ? 1 : 0
    };
  }

  // ---- compute + render ----
  var lastBigStandby = false;

  function recompute() {
    var rate = parseFloat(rateEl.value) || 0;
    var standing = parseFloat(standingEl.value) || 0;
    var nightRaw = nightEl.value.trim();
    var nightRate = nightRaw === "" ? null : (parseFloat(nightRaw) || 0);
    var appliances = items.map(readItem);

    $("empty").hidden = items.length > 0;

    // Show the per-row "runs overnight" tick only once a night rate is entered.
    var showNight = nightRate !== null;
    $("night-hint").hidden = !showNight;
    items.forEach(function (item) { item.nightWrap.hidden = !showNight; });

    var summary = E.billSummary(appliances, { unitRate: rate, standingChargeDay: standing, co2PerKwh: co2Factor(), nightRate: nightRate });

    // per-row live cost, at the night rate when it's ticked and in use
    items.forEach(function (item) {
      var one = E.applianceCost(readItem(item), rate);
      var costYear = one.costYear;
      if (nightRate !== null && item.fields.night.checked) costYear = one.energy.kwhYear * nightRate;
      item.costEl.textContent = rate > 0 && costYear > 0 ? money(costYear) + "/yr" : "—";
    });

    var ready = rate > 0 && items.length > 0;
    var hasResult = ready && summary.runningCostYear > 0;

    renderResult(summary, ready, hasResult, standing);

    Watt.context({ bad: false, ready: ready, result: hasResult });

    if (hasResult && summary.standbyShare >= 0.1 && !lastBigStandby) {
      lastBigStandby = true;
      Watt.react("bigstandby");
    } else if (!hasResult || summary.standbyShare < 0.1) {
      lastBigStandby = false;
    }

    saveToHash(appliances, rate, standing, nightRate);
  }

  function renderResult(s, ready, hasResult, standing) {
    var head = $("headline");
    var bd = $("breakdown");
    var sub = $("sub");

    if (!ready) {
      head.hidden = true;
      bd.innerHTML = "";
      sub.textContent = items.length === 0 ? "" : "Pop your price per kWh in at the top to see the cost.";
      $("traps").hidden = true;
      return;
    }

    head.hidden = false;
    $("hl-year").textContent = money(s.totalYear);
    var runMonth = money(s.runningCostMonth);
    $("hl-month").textContent = standing > 0
      ? "About " + money(s.totalMonth) + " a month, standing charge and all."
      : "About " + money(s.totalMonth) + " a month.";
    var co2El = $("hl-co2");
    if (s.co2Year > 0) {
      var kg = Math.round(s.co2Year);
      var miles = Math.round(s.drivingMilesYear);
      co2El.textContent = "About " + kg.toLocaleString() + " kg of CO₂ a year, like driving " + miles.toLocaleString() + " miles.";
      co2El.hidden = false;
    } else {
      co2El.textContent = "";
      co2El.hidden = true;
    }
    sub.textContent = "";

    // breakdown rows
    var top = s.appliances.slice(0, 12);
    var max = top.length ? top[0].costYear : 1;
    bd.innerHTML = "";
    top.forEach(function (c) {
      var isBig = s.biggest.indexOf(c) >= 0;
      var row = document.createElement("div");
      row.className = "brow";
      var pct = max > 0 ? Math.max(3, Math.round((c.costYear / max) * 100)) : 0;
      var tags = "";
      if (isBig && s.appliances.length > 2) tags += '<span class="tag big">one of the big ones</span>';
      if (c.standbyShare >= 0.25 && c.standbyCostYear > 0) tags += ' <span class="tag warn">mostly standby</span>';
      var note = "";
      if (c.standbyCostYear > 0) {
        note = "Standby alone is " + money(c.standbyCostYear) + " a year of that.";
      }
      row.innerHTML =
        '<div class="b-main"><h3>' + esc(c.name) + " " + tags + "</h3>" +
        (note ? '<p class="b-note">' + note + "</p>" : "") +
        '<div class="b-bar"><span style="width:' + pct + '%"></span></div></div>' +
        '<div class="b-amount">' + money(c.costYear) + "<br><small>" + moneyPrecise(c.costMonth) + "/mo</small></div>";
      bd.appendChild(row);
    });

    // traps
    var traps = [];
    if (s.nightRateUsed && s.economySavingYear > 0.5) {
      traps.push("<b>The night rate is earning its keep.</b> Running the things you've ticked overnight saves about <b>" +
        money(s.economySavingYear) + " a year</b> against the day rate. Economy 7 only pays off if you move enough use to the cheap hours, so the more you shift, the more this grows.");
    }
    if (s.standbyCostYear > 0) {
      traps.push("<b>Standby adds up.</b> Things left plugged in but off cost about <b>" +
        money(s.standbyCostYear) + " a year</b> here, " + Math.round(s.standbyShare * 100) +
        "% of the running cost. A switched socket or a plug strip turns that off for free.");
    }
    if (s.standingChargeYear > 0) {
      traps.push("<b>The standing charge is fixed.</b> That's <b>" + money(s.standingChargeYear) +
        " a year</b> you pay before you switch a single thing on, so saving on an appliance never touches it.");
    } else {
      traps.push("<b>The standing charge is separate.</b> Add yours at the top if your bill has one; it's a daily fee you pay whatever you use, so keep it out of your per-thing sums.");
    }
    $("trap-list").innerHTML = traps.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    $("traps").hidden = !hasResult;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ---- copy + share ----
  function plainText() {
    var rate = parseFloat(rateEl.value) || 0;
    var standing = parseFloat(standingEl.value) || 0;
    var nightRaw = nightEl.value.trim();
    var nightRate = nightRaw === "" ? null : (parseFloat(nightRaw) || 0);
    var s = E.billSummary(items.map(readItem), { unitRate: rate, standingChargeDay: standing, co2PerKwh: co2Factor(), nightRate: nightRate });
    var lines = ["What it costs to run (Wattson)", ""];
    s.appliances.forEach(function (c) {
      lines.push("- " + c.name + ": " + money(c.costYear) + "/yr" +
        (c.standbyCostYear > 0 ? " (standby " + money(c.standbyCostYear) + ")" : ""));
    });
    lines.push("");
    lines.push("Running cost: " + money(s.runningCostYear) + "/yr");
    if (s.standbyCostYear > 0) lines.push("Of that, standby: " + money(s.standbyCostYear) + "/yr");
    if (s.standingChargeYear > 0) lines.push("Standing charge: " + money(s.standingChargeYear) + "/yr (fixed)");
    if (s.nightRateUsed && s.economySavingYear > 0.5) lines.push("Night rate saving: " + money(s.economySavingYear) + "/yr vs the day rate");
    lines.push("Total: " + money(s.totalYear) + "/yr at " + moneyPrecise(rate) + "/kWh");
    if (s.co2Year > 0) lines.push("Carbon: about " + Math.round(s.co2Year).toLocaleString() + " kg CO2/yr (like driving " + Math.round(s.drivingMilesYear).toLocaleString() + " miles)");
    return lines.join("\n");
  }

  function copyText(text, okMsg, reaction) {
    var done = function () { status(okMsg); Watt.react(reaction); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { status("Couldn't copy, sorry."); }
    ta.remove();
  }
  function status(msg) {
    var el = $("status"); el.textContent = msg;
    clearTimeout(status._t); status._t = setTimeout(function () { el.textContent = ""; }, 4000);
  }

  // Compact state in the URL hash so a share link reopens the same list.
  function saveToHash(appliances, rate, standing, nightRate) {
    try {
      var state = {
        c: currency, r: rate, s: standing, n: nightRate,
        a: appliances.map(function (a) { return [a.name, a.watts, a.hoursPerDay, a.standbyWatts, a.quantity, a.nightShare ? 1 : 0]; })
      };
      var enc = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
      history.replaceState(null, "", "#" + enc);
    } catch (e) {}
  }
  function loadFromHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return false;
    try {
      var state = JSON.parse(decodeURIComponent(escape(atob(h))));
      if (state.c) { setCurrency(state.c); curPick.value = state.c; }
      if (state.r != null) rateEl.value = state.r || "";
      if (state.s != null) standingEl.value = state.s || "";
      if (state.n != null) nightEl.value = state.n || "";
      (state.a || []).forEach(function (a) {
        addItem({ name: a[0], watts: a[1], hoursPerDay: a[2], standbyWatts: a[3], quantity: a[4], nightShare: a[5] });
      });
      return (state.a || []).length > 0;
    } catch (e) { return false; }
  }

  // ---- presets ----
  function fillPresetMenu() {
    P.forEach(function (p, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = p.name;
      presetSel.appendChild(o);
    });
  }

  // ---- wire up ----
  fillPresetMenu();
  setCurrency(curPick.value);

  curPick.addEventListener("change", function () { setCurrency(curPick.value); recompute(); });
  rateEl.addEventListener("input", recompute);
  standingEl.addEventListener("input", recompute);
  nightEl.addEventListener("input", recompute);

  $("add-preset").addEventListener("click", function () {
    var p = P[parseInt(presetSel.value, 10) || 0];
    if (p) { addItem(p); Watt.react("added"); recompute(); }
  });
  $("add-blank").addEventListener("click", function () {
    var item = addItem({});
    Watt.react("added");
    item.fields.name.focus();
    recompute();
  });

  $("copy").addEventListener("click", function () {
    if (!items.length) { status("Add a thing first."); return; }
    copyText(plainText(), "Copied the list.", "copied");
  });
  $("share").addEventListener("click", function () {
    copyText(location.href, "Share link copied.", "shared");
  });

  // Start: reopen a shared list, or seed a couple so the page isn't blank.
  var loaded = loadFromHash();
  if (!loaded) {
    rateEl.value = "0.30";
    standingEl.value = "0.60";
    addItem(P.find(function (p) { return p.name === "Set-top box / recorder"; }));
    addItem(P.find(function (p) { return p.name === "Fridge-freezer"; }));
  }
  recompute();
})();
