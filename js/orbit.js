/*
 * Orbit: the interactions.
 * Everything that moves is a CSS animation in index.html. This script only winds those animations:
 * drag the Earth round the sun, drag the Moon round the Earth, turn the sun like a dial,
 * or press a small circle to spool time to the start of its story.
 */
(function () {
  'use strict';

  var svg = document.querySelector('.orbit-stage svg');
  if (!svg || !document.getAnimations) { return; }

  var ROUND = 360000;          // one round of the Earth: twelve stories
  var SLOT = ROUND / 12;       // one story, as long as the long hand takes to go round once
  var RS = 378;                // radius of the Earth's path round the sun
  var SUN = { x: 960, y: 540 };  // the sun, in drawing units
  var NAMES = /^(orbitTurn|orbitBack|moonOrbit|moonPhaseD|moonPhaseL|storyVis\d+|tick\d+|s\d+_\w+)$/;

  var aurora = svg.querySelector('.orbit-aurora');
  var held = [];
  var mode = null;             // 'earth' | 'moon' | 'sun' while something is held
  var holdMs = 0;
  var holdAngle = 0;
  var spool = null;

  // every animation that belongs to the Earth's round: its turn round the sun and the stories acted out on it
  function cycleAnims() {
    return document.getAnimations().filter(function (a) { return NAMES.test(a.animationName || ''); });
  }

  function wrap(ms) { return ((ms % ROUND) + ROUND) % ROUND; }

  function nowMs(anims) { return anims.length ? wrap(anims[0].currentTime || 0) : 0; }

  function setAll(ms) { held.forEach(function (a) { a.currentTime = ms; }); }

  function playAll() { held.forEach(function (a) { a.play(); }); }

  // drawing units to screen pixels, whatever size the window is
  function toScreen(x, y) {
    var m = svg.getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  // angle of the pointer round a point, from twelve o'clock clockwise
  function angleAround(e, p) {
    return Math.atan2(e.clientX - p.x, p.y - e.clientY);
  }

  function earthAt(ms) {
    var a = 2 * Math.PI * (ms / ROUND);
    return toScreen(SUN.x + RS * Math.sin(a), SUN.y - RS * Math.cos(a));
  }

  function turn(d) {
    while (d > Math.PI) { d -= 2 * Math.PI; }
    while (d < -Math.PI) { d += 2 * Math.PI; }
    return d;
  }

  function showAurora(on) { if (aurora) { aurora.style.opacity = on ? '1' : '0'; } }

  function stopSpool() {
    if (spool) { cancelAnimationFrame(spool); spool = null; }
    if (!mode) { showAurora(false); }
  }

  function grab(kind) {
    return function (e) {
      e.preventDefault();
      e.stopPropagation();
      stopSpool();
      held = cycleAnims();
      if (!held.length) { return; }
      if (e.currentTarget.setPointerCapture) { e.currentTarget.setPointerCapture(e.pointerId); }
      e.currentTarget.style.cursor = 'grabbing';
      mode = kind;
      held.forEach(function (a) { a.pause(); });
      holdMs = nowMs(held);
      if (kind === 'earth') {
        showAurora(true);
        move(e);
      } else if (kind === 'sun') {
        holdAngle = angleAround(e, toScreen(SUN.x, SUN.y));
      } else {
        holdAngle = angleAround(e, earthAt(holdMs));
      }
    };
  }

  function move(e) {
    if (!mode) { return; }
    e.preventDefault();
    e.stopPropagation();
    var ang, ms;
    if (mode === 'earth') {
      // the Earth follows the pointer round the sun
      ang = angleAround(e, toScreen(SUN.x, SUN.y));
      ms = (ang / (2 * Math.PI) + 1) % 1 * ROUND;
    } else if (mode === 'sun') {
      // the sun turns like a dial: one turn is the whole round
      ang = angleAround(e, toScreen(SUN.x, SUN.y));
      ms = wrap(holdMs + turn(ang - holdAngle) / (2 * Math.PI) * ROUND);
      holdAngle = ang;
    } else {
      // the Moon fine-tunes: one turn round the Earth is one story
      ang = angleAround(e, earthAt(holdMs));
      ms = wrap(holdMs + turn(ang - holdAngle) / (2 * Math.PI) * SLOT);
    }
    holdMs = ms;
    setAll(ms);
    if (mode === 'moon') { holdAngle = angleAround(e, earthAt(ms)); }
  }

  function release(e) {
    if (!mode) { return; }
    e.stopPropagation();
    if (mode === 'earth') { showAurora(false); }
    mode = null;
    e.currentTarget.style.cursor = 'grab';
    playAll();
  }

  function hookDrag(el, kind) {
    if (!el) { return; }
    el.addEventListener('pointerdown', grab(kind));
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', function (e) { if (mode === kind) { release(e); } });
  }

  hookDrag(svg.querySelector('[data-drag="sun"]'), 'sun');
  hookDrag(svg.querySelector('[data-drag="earth"]'), 'earth');
  hookDrag(svg.querySelector('[data-drag="moon"]'), 'moon');

  // press a small circle: time spools quickly round to the start of that story, then runs on from there
  function pickStory(i) {
    var anims = cycleAnims();
    if (!anims.length || mode) { return; }
    stopSpool();
    held = anims;
    held.forEach(function (a) { a.pause(); });
    var from = nowMs(held);
    var to = wrap((i - 0.5 + 0.04) * SLOT);
    var d = to - from;
    while (d > ROUND / 2) { d -= ROUND; }
    while (d < -ROUND / 2) { d += ROUND; }
    var dur = Math.min(2400, 700 + Math.abs(d) / SLOT * 170);
    var t0 = performance.now();
    showAurora(true);
    var step = function (now) {
      var t = Math.min(1, (now - t0) / dur);
      var k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      setAll(wrap(from + d * k));
      if (t < 1) {
        spool = requestAnimationFrame(step);
      } else {
        spool = null;
        showAurora(false);
        playAll();
      }
    };
    spool = requestAnimationFrame(step);
  }

  Array.prototype.forEach.call(svg.querySelectorAll('[data-story]'), function (el) {
    var i = Number(el.getAttribute('data-story')) || 0;
    el.addEventListener('click', function (e) { e.preventDefault(); pickStory(i); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickStory(i); }
    });
  });
})();
