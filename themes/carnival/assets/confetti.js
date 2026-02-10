(function() {
  var canvas = document.getElementById('confettiCanvas');
  var ctx = canvas.getContext('2d');
  var W, H, N = 60, PR = 8, MP = 25;
  var colors = ['#7c3aed','#fbbf24','#10b981','#ec4899','#f97316','#06b6d4'];
  var pieces = [], surfs = [], landed = [], maxLanded = 350, fc = 0, seeded = false;

  function sz() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
  sz();
  addEventListener('resize', function() { sz(); scan(); });

  function scan() {
    var sy = scrollY, old = surfs;
    surfs = [];
    var els = document.querySelectorAll(
      '[class*="rounded"][class*="border"],[class*="border"][class*="rounded"],[data-embed-container]'
    );
    for (var i = 0; i < els.length; i++) {
      if (els[i] === canvas) continue;
      var r = els[i].getBoundingClientRect();
      if (r.width < 40 || r.height < 15) continue;
      var dt = Math.round(r.top + sy), l = Math.round(r.left), ri = Math.round(r.right);
      var cols = Math.ceil((ri - l) / PR), pile = null;
      for (var j = 0; j < old.length; j++) {
        if (Math.abs(old[j].t - dt) < 8 && Math.abs(old[j].l - l) < 8 && old[j].p.length === cols) {
          pile = old[j].p; old.splice(j, 1); break;
        }
      }
      if (!pile) pile = new Float32Array(cols);
      surfs.push({ l: l, r: ri, t: dt, p: pile });
    }
    if (!seeded && surfs.length > 0) {
      seeded = true;
      for (var si = 0; si < surfs.length; si++) {
        var sp = surfs[si].p;
        for (var k = 0; k < sp.length; k++) {
          var edge = Math.min(k, sp.length - 1 - k);
          sp[k] = Math.min(1, edge / 3) * (2 + Math.random() * 4);
        }
        var sl = surfs[si];
        for (var k = 0; k < 25; k++) {
          var lx = sl.l + Math.random() * (sl.r - sl.l);
          var col = Math.floor((lx - sl.l) / PR);
          var isStrip = Math.random() < 0.33;
          landed.push({
            dx: lx, dy: sl.t - (sp[col] || 0) * Math.random(),
            w: isStrip ? Math.random() * 2 + 1 : Math.random() * 6 + 4,
            h: isStrip ? Math.random() * 10 + 8 : Math.random() * 6 + 4,
            c: colors[Math.floor(Math.random() * 6)],
            ic: !isStrip && Math.random() < 0.33,
            rot: Math.random() * 6.28, fl: Math.random() * 6.28,
            o: 0.5 + Math.random() * 0.3
          });
        }
      }
    }
  }

  function mk(full) {
    var isStrip = Math.random() < 0.33;
    return {
      x: Math.random() * W, y: full ? Math.random() * H : -Math.random() * 30 - 10,
      w: isStrip ? Math.random() * 2 + 1 : Math.random() * 6 + 4,
      h: isStrip ? Math.random() * 10 + 8 : Math.random() * 6 + 4,
      c: colors[Math.floor(Math.random() * 6)],
      ic: !isStrip && Math.random() < 0.33,
      rot: Math.random() * 6.28, rs: (Math.random() - 0.5) * 0.08,
      vx: (Math.random() - 0.5) * 0.8, vy: Math.random() * 1.2 + 0.4,
      wb: Math.random() * 6.28, wbs: Math.random() * 0.04 + 0.01,
      o: Math.random() * 0.4 + 0.6,
      fl: Math.random() * 6.28, fls: Math.random() * 0.05 + 0.02
    };
  }

  function drawShape(x, y, p) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.rot);
    ctx.scale(Math.cos(p.fl), 1);
    ctx.globalAlpha = p.o;
    ctx.fillStyle = p.c;
    if (p.ic) {
      ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.28); ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }

  for (var i = 0; i < N; i++) pieces.push(mk(true));
  scan();

  function frame() {
    ctx.clearRect(0, 0, W, H);
    var sy = scrollY;
    if (++fc % 120 === 0) scan();

    for (var i = 0; i < landed.length; i++) {
      var lp = landed[i];
      var vy = lp.dy - sy;
      if (vy < -30 || vy > H + 30) continue;
      drawShape(lp.dx, vy, lp);
    }

    for (var i = 0; i < N; i++) {
      var p = pieces[i];
      p.wb += p.wbs; p.fl += p.fls; p.rot += p.rs;
      p.x += Math.sin(p.wb) * 0.8 + p.vx;
      p.y += p.vy;
      var dy = p.y + sy, hit = false;

      for (var j = 0; j < surfs.length; j++) {
        var s = surfs[j];
        if (p.x >= s.l && p.x < s.r) {
          var col = Math.floor((p.x - s.l) / PR);
          if (col >= 0 && col < s.p.length && dy >= s.t - s.p[col] - 2) {
            if (s.p[col] < MP) {
              s.p[col] += 1.2 + Math.random() * 0.8;
              if (col > 0) s.p[col - 1] = Math.min(MP, s.p[col - 1] + 0.4);
              if (col < s.p.length - 1) s.p[col + 1] = Math.min(MP, s.p[col + 1] + 0.4);
            }
            if (landed.length >= maxLanded) landed.shift();
            landed.push({
              dx: p.x + (Math.random() - 0.5) * 3,
              dy: s.t - s.p[col] + Math.random() * 2,
              w: p.w, h: p.h, c: p.c, ic: p.ic,
              rot: p.rot, fl: p.fl, o: p.o * 0.85
            });
            hit = true; break;
          }
        }
      }

      if (hit || p.y > H + 20) { pieces[i] = mk(false); continue; }
      drawShape(p.x, p.y, p);
    }

    requestAnimationFrame(frame);
  }
  frame();
})();
