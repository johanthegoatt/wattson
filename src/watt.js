// Watt, the little meter who helps you see what runs the bill up. Watt looks
// at your pointer (or the box you're typing in on a phone), gives a tip for
// where you are when tapped, buzzes when a total lands, and throws off a few
// sparks if you tap five times fast. Everything Watt says goes through the
// bubble's live region, so screen readers hear it too.
(function () {
  "use strict";
  var btn = document.getElementById("watt");
  var bubble = document.getElementById("watt-bubble");
  var dock = document.getElementById("watt-dock");
  var hide = document.getElementById("watt-hide");
  if (!btn) {
    window.Watt = { react: function () {}, context: function () {}, say: function () {} };
    return;
  }

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "start";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};
  var greeted = false;

  var TIPS = {
    start: [
      "Hi, I'm Watt! Put your price per kWh in first, then add a thing or two.",
      "Your bill has two numbers: the price of a unit, and a daily standing charge. Both go up top.",
      "No idea of the watts? Start from a common one and nudge it."
    ],
    details: [
      "The watts are on the plug or the maker's page. Hours a day is your honest guess.",
      "Standby is the trickle when it's off but still plugged in. Tellies and TV boxes are the sneaky ones.",
      "Used once or twice a week? Put the hours for a whole week and I'll spread them out."
    ],
    result: [
      "The few at the top are where your money goes. Those are the ones worth a look.",
      "See the standby line? That's cost for things doing nothing. The wall switch is free to flip.",
      "The standing charge sits on its own because you pay it even with everything off."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "buzz");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "buzz"); });

  function context(c) {
    if (c.bad) { tipKey = "start"; baseMood = "worried"; }
    else if (!c.ready) { tipKey = "start"; baseMood = "sleepy"; }
    else if (!c.result) { tipKey = "details"; baseMood = "happy"; }
    else { tipKey = "result"; baseMood = "happy"; }
    if (!flashing) setMood(baseMood);
    if (!greeted) {
      greeted = true;
      setTimeout(function () { if (!bubble.textContent && baseMood === "sleepy") say(TIPS.start[0], 9000); }, 900);
    }
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.result;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      say("I'm back! Tap me any time for a tip.");
      play("hop");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      play("buzz");
      flash("wow", 1200);
      sparkle(10);
      say("Zap! Careful, I'm full of beans today.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1600);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("wattson.wattTucked", tucked ? "1" : ""); } catch (e) {}
  }
  try { if (localStorage.getItem("wattson.wattTucked")) dock.classList.add("tucked"); } catch (e) {}

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".w-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.66;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 220);
    var x = (dx / d) * 3 * reach, y = (dy / d) * 3 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (ev) {
    target = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (ev) {
    var r = ev.target.getBoundingClientRect && ev.target.getBoundingClientRect();
    if (!r || ev.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  // A few teal sparks fly off the meter.
  function sparkle(n) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.textContent = "✦";
      s.style.left = r.left + r.width * (0.3 + Math.random() * 0.4) + "px";
      s.style.top = r.top + r.height * 0.3 + "px";
      s.style.fontSize = (10 + Math.random() * 12) + "px";
      document.body.appendChild(s);
      var dx = (Math.random() - 0.5) * 220, dy = -(60 + Math.random() * 160);
      var a = s.animate([
        { transform: "translate(0,0) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + dx * 0.6 + "px," + dy + "px) scale(1.2) rotate(120deg)", opacity: 1, offset: 0.6 },
        { transform: "translate(" + dx + "px," + (dy + 180) + "px) scale(0.6) rotate(240deg)", opacity: 0 }
      ], { duration: 1200 + Math.random() * 600, easing: "ease-out" });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(s);
    }
  }

  function react(what) {
    switch (String(what)) {
      case "added": play("hop"); say("Added. Set the watts and the hours to match yours."); break;
      case "removed": say("Taken off the list."); break;
      case "standby": flash("worried", 1200); say("Standby on that one. It sips power all year while it waits."); break;
      case "result": play("buzz"); flash("party", 1500); say("There's the year. The ones at the top are where it adds up."); break;
      case "bigstandby": flash("wow", 1300); say("Standby is a real slice of this. Switching off at the wall would trim it."); break;
      case "copied": play("hop"); flash("party", 1200); say("Copied! Paste it wherever you like."); break;
      case "shared": play("hop"); say("Link copied. It carries your list, nothing else."); break;
    }
  }

  window.Watt = { react: react, context: context, say: say };
})();
