/* Dashboard charts — telco (Vantis) and banking (Northbank) account pages.

   Drawn as inline SVG, no library. Everything is built from the account's own
   state (Store.usageState / Store.financeState), so the charts move when the
   SC uses the "Mimic" buttons. Where a month of history would be needed and
   the demo only has today, the past is filled in from a seed on the visitor
   id: the same person always sees the same history, a new visitor a new one,
   and the latest point always lands on the real current figure. */
(function () {
  'use strict';

  function seedFrom(s) { var h = 2166136261; s = String(s || 'x');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
  function css(name, fb) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fb; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ord(n) { var t = n % 100, u = n % 10; return n + ((t > 10 && t < 14) ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th'); }
  function day(offset) { var d = new Date(); d.setDate(d.getDate() - offset); return d; }
  function monthName(offset) { var d = new Date(); d.setMonth(d.getMonth() - offset); return d.toLocaleDateString(undefined, { month: 'short' }); }

  function card(title, sub, body, wide) {
    return '<div class="dchart' + (wide ? ' dchart--wide' : '') + '"><div class="dchart__head"><h3>' + esc(title) + '</h3>' +
      (sub ? '<span>' + sub + '</span>' : '') + '</div>' + body + '</div>';
  }

  /* Area/line chart. values: numbers oldest→newest. */
  function line(values, opts) {
    var W = 640, H = 220, P = { l: 8, r: 8, t: 14, b: 26 };
    var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
    var pad = (max - min) * 0.15 || 1; min -= pad; max += pad;
    var x = function (i) { return P.l + i * (W - P.l - P.r) / (values.length - 1); };
    var y = function (v) { return P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min)); };
    var pts = values.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); });
    var acc = opts.color;
    var grid = [0.25, 0.5, 0.75].map(function (f) { var yy = P.t + (H - P.t - P.b) * f;
      return '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + yy + '" y2="' + yy + '" stroke="currentColor" stroke-opacity=".08"/>'; }).join('');
    var labels = (opts.labels || []).map(function (l) {
      return '<text x="' + x(l.i) + '" y="' + (H - 6) + '" font-size="12" fill="currentColor" fill-opacity=".55" text-anchor="middle">' + esc(l.t) + '</text>'; }).join('');
    var last = values.length - 1;
    return '<svg class="dchart__svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="lg' + opts.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + acc + '" stop-opacity=".28"/><stop offset="1" stop-color="' + acc + '" stop-opacity="0"/></linearGradient></defs>' +
      grid + '<polygon points="' + P.l + ',' + (H - P.b) + ' ' + pts.join(' ') + ' ' + x(last) + ',' + (H - P.b) + '" fill="url(#lg' + opts.id + ')"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + acc + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + x(last) + '" cy="' + y(values[last]) + '" r="5" fill="' + acc + '" stroke="#fff" stroke-width="2"/>' + labels + '</svg>';
  }

  /* Bar chart. bars: [{v, label, hi}] */
  function bars(list, opts) {
    var W = 640, H = 220, P = { l: 6, r: 6, t: 12, b: 26 };
    var max = Math.max.apply(null, list.map(function (b) { return b.v; })) || 1;
    var n = list.length, gap = opts.gap == null ? 0.35 : opts.gap, bw = (W - P.l - P.r) / n;
    var out = list.map(function (b, i) {
      var h = (H - P.t - P.b) * b.v / max, x = P.l + i * bw + bw * gap / 2, w = bw * (1 - gap);
      var op = b.hi ? 1 : (opts.soft || .35);
      return '<rect x="' + x.toFixed(1) + '" y="' + (H - P.b - h).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(h, 1.5).toFixed(1) + '" rx="' + Math.min(6, w / 3).toFixed(1) + '" fill="' + opts.color + '" fill-opacity="' + op + '"><title>' + esc(b.tip || '') + '</title></rect>' +
        (b.label ? '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 6) + '" font-size="12" fill="currentColor" fill-opacity=".55" text-anchor="middle">' + esc(b.label) + '</text>' : '');
    }).join('');
    return '<svg class="dchart__svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' + out + '</svg>';
  }

  /* Donut with legend. parts: [{label, v, color}] */
  function donut(parts, centre, sub, fmt) {
    var total = parts.reduce(function (s, p) { return s + p.v; }, 0) || 1, a = -Math.PI / 2, R = 80, r = 54, cx = 100, cy = 100, segs = '';
    parts.forEach(function (p) {
      var f = p.v / total, b = a + f * Math.PI * 2, large = f > 0.5 ? 1 : 0;
      var p1 = [cx + R * Math.cos(a), cy + R * Math.sin(a)], p2 = [cx + R * Math.cos(b), cy + R * Math.sin(b)];
      var q1 = [cx + r * Math.cos(b), cy + r * Math.sin(b)], q2 = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      segs += '<path d="M' + p1 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p2 + ' L' + q1 + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + q2 + ' Z" fill="' + p.color + '"/>';
      a = b;
    });
    var legend = parts.map(function (p) {
      return '<li><i style="background:' + p.color + '"></i><span>' + esc(p.label) + '</span><b>' + fmt(p.v) + '</b></li>'; }).join('');
    return '<div class="dchart__donut"><svg viewBox="0 0 200 200">' + segs +
      '<text x="100" y="98" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">' + esc(centre) + '</text>' +
      '<text x="100" y="120" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".6">' + esc(sub) + '</text></svg>' +
      '<ul class="dchart__legend">' + legend + '</ul></div>';
  }

  /* Progress ring */
  function ring(frac, big, small, color) {
    var R = 70, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac));
    return '<div class="dchart__ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="' + R + '" fill="none" stroke="currentColor" stroke-opacity=".08" stroke-width="16"/>' +
      '<circle cx="90" cy="90" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="16" stroke-linecap="round" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 90 90)"/>' +
      '<text x="90" y="88" text-anchor="middle" font-size="26" font-weight="700" fill="currentColor">' + esc(big) + '</text>' +
      '<text x="90" y="110" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".6">' + esc(small) + '</text></svg></div>';
  }

  function palette(acc) { return [acc, '#F5B94A', '#9B8CFF', '#FF7A93', '#5ED3E6', '#8A94A6']; }
  var GLOW = { telco: '#3EE09A', banking: '#6FA8FF' };
  function glow() { return GLOW[(window.VERTICAL || {}).key] || css('--accent', '#6FA8FF'); }

  /* Insights: one plain sentence each, worked out from the account's own
     numbers. The kind of message the platform would decide per customer. */
  function insights(list) {
    return '<div class="dinsights">' + list.map(function (x) {
      return '<div class="dinsight"><span class="dinsight__tag">' + esc(x.tag) + '</span><p>' + x.text + '</p>' +
        (x.cta ? '<a href="' + x.href + '">' + esc(x.cta) + ' →</a>' : '') + '</div>'; }).join('') + '</div>';
  }
  function frame(host, title, sub, inner) {
    // Animate once per page view. Later redraws (the SC buttons, the page's
    // own second render) update in place without replaying the entrance.
    var settled = host.getAttribute('data-animated') === '1';
    host.className = 'dcharts dcharts--future' + (settled ? ' is-live is-settled' : '');
    host.innerHTML = '<div class="dfuture__head"><div><span class="dfuture__spark">✦</span> ' + esc(title) + '</div><span>' + esc(sub) + '</span></div>' + inner;
    if (!settled) {
      host.setAttribute('data-animated', '1');
      (window.requestAnimationFrame || setTimeout)(function () { host.classList.add('is-live'); });
    }
  }

  /* ---------------- TELCO ---------------- */
  function telco(host, u, st) {
    var acc = glow(), rnd = seedFrom(u.uuid || u.email || 'vantis');
    var used = st.used || 0, allow = st.allowance || 20, pct = used / allow;
    var today = new Date().getDate(), days = Math.max(today, 7);

    // Daily data this billing month, summing to what has been used.
    var w = [];
    for (var i = 0; i < days; i++) { var d = day(days - 1 - i).getDay(); w.push((d === 0 || d === 6 ? 1.6 : 1) * (0.4 + rnd())); }
    var ws = w.reduce(function (s, v) { return s + v; }, 0) || 1;
    var daily = w.map(function (v, i) { return { v: used * v / ws, label: (i % 5 === 0 || i === days - 1) ? String(day(days - 1 - i).getDate()) : '', hi: i === days - 1,
      tip: day(days - 1 - i).toLocaleDateString() }; });
    if (!used) daily = daily.map(function (b) { b.v = 0; return b; });

    var split = [['Streaming', .38], ['Social', .24], ['Maps & travel', .12], ['Music', .10], ['Calls & other', .16]];
    var cols = palette(acc);
    var parts = split.map(function (s, i) { return { label: s[0], v: Math.round(used * s[1] * 10) / 10, color: cols[i] }; });

    var price = Number(u.plan_price) || 14, bills = [];
    for (var m = 5; m >= 0; m--) bills.push({ v: price + (m === 0 ? 0 : (rnd() < .25 ? 5 : 0)), label: monthName(m), hi: m === 0, tip: '€' + price });

    var left = Math.max(0, Math.round((allow - used) * 10) / 10);
    var monthDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    var projected = Math.round(used / Math.max(today, 1) * monthDays * 10) / 10, tips = [];
    if (allow >= 1000) tips.push({ tag: 'Unlimited', text: 'You have used <b>' + used + ' GB</b> this month. Nothing to count, nothing to top up.' });
    else if (projected > allow) {
      var runOut = Math.max(today + 1, Math.round(allow / Math.max(used / Math.max(today, 1), .01)));
      tips.push({ tag: 'Heads up', text: 'At this pace you will run out around the <b>' + ord(Math.min(runOut, monthDays)) + '</b>. A data boost covers the rest of the month.', cta: 'Add a boost', href: 'topup.html' });
    } else if (used) tips.push({ tag: 'On track', text: 'At this pace you will use about <b>' + projected + ' GB</b> this month, with <b>' + Math.round((allow - projected) * 10) / 10 + ' GB</b> to spare.' });
    else tips.push({ tag: 'New month', text: 'Your <b>' + allow + ' GB</b> is ready. We will tell you before you get close.' });
    if (used) tips.push({ tag: 'Your habits', text: 'Streaming is <b>38%</b> of your data. Most of it happens in the evening, when home Wi-Fi would carry it.' });
    tips.push({ tag: 'Travel', text: 'Heading abroad? Your plan works in <b>the EU at no extra cost</b>, same allowance as at home.' });
    host.innerHTML =
      card('Data this month', left + ' GB left', ring(pct, allow >= 1000 ? '∞' : left + ' GB', allow >= 1000 ? 'Unlimited' : 'left of ' + allow + ' GB', pct >= .85 ? '#c0392b' : acc)) +
      card('Where your data goes', used ? used + ' GB so far' : 'Nothing used yet', used ? donut(parts, used + ' GB', 'used', function (v) { return v + ' GB'; })
        : '<p class="dchart__empty">Use the SC controls below to add a week of usage.</p>') +
      card('Daily data', 'This billing month', bars(daily, { color: acc, soft: .4, gap: .3 }), true) +
      card('Your bills', 'Last six months', bars(bills, { color: acc, soft: .3 }));
    frame(host, 'Your plan, read for you', 'Updated just now', insights(tips) + host.innerHTML);
  }

  /* ---------------- BANKING ---------------- */
  function finance(host, u, st) {
    var acc = glow(), rnd = seedFrom(u.uuid || u.email || 'northbank');
    var gbp = function (n) { return '£' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 }); };
    var bal = Number(st.balance) || 0;

    // Balance over 30 days: walk backwards from today's real balance.
    var series = [bal], b = bal;
    for (var i = 1; i < 30; i++) {
      var dt = day(i), spend = 15 + rnd() * 70;
      if (dt.getDate() === 25) b -= 2100;            // payday, seen backwards
      else b += spend;
      if (dt.getDate() === 1) b += 950;              // rent goes out on the 1st
      series.unshift(Math.round(b));
    }
    var labels = [0, 7, 14, 21, 29].map(function (i) { return { i: i, t: day(29 - i).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }; });

    var outs = (st.transactions || []).filter(function (t) { return t.amount < 0; });
    var real = outs.reduce(function (s, t) { return s + -t.amount; }, 0);
    var cols = palette(acc);
    var cats = [['Home & bills', 1180], ['Groceries', 310 + Math.round(rnd() * 60)], ['Eating out', 185 + Math.round(rnd() * 50)],
      ['Transport', 120 + Math.round(rnd() * 30)], ['Shopping', 140 + Math.round(real)], ['Other', 90]];
    var parts = cats.map(function (c, i) { return { label: c[0], v: c[1], color: cols[i] }; });
    var total = parts.reduce(function (s, p) { return s + p.v; }, 0);

    var io = [];
    for (var m = 5; m >= 0; m--) {
      var inn = 2100 + (rnd() < .3 ? 200 : 0), out = 1750 + Math.round(rnd() * 450);
      io.push({ v: inn, label: monthName(m), hi: true, tip: 'In ' + gbp(inn) });
      io.push({ v: out, label: '', hi: false, tip: 'Out ' + gbp(out) });
    }

    var goal = 2000, saved = 1240 + Math.round((bal % 97));
    var eat = parts[2].v, eatLast = eat + 40 + Math.round(rnd() * 30);
    var perMonth = 190, monthsLeft = Math.ceil((goal - saved) / perMonth);
    var hit = new Date(); hit.setMonth(hit.getMonth() + monthsLeft);
    var dNow = new Date().getDate(), toPay = dNow < 25 ? 25 - dNow : 25 + (new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - dNow);
    var tips = [
      { tag: 'Spending', text: 'You spent <b>' + gbp(eat) + '</b> eating out this month, <b>' + gbp(eatLast - eat) + ' less</b> than last month.' },
      { tag: 'Goals', text: 'At this rate your Lisbon trip is fully saved by <b>' + hit.toLocaleDateString(undefined, { month: 'long' }) + '</b>.', cta: 'Boost the pot', href: 'open.html?line=Northbank%20Saver' },
      { tag: 'Payday', text: 'Payday is in <b>' + toPay + ' days</b>. Your bills are covered until then.' }
    ];
    host.innerHTML =
      card('Balance', '30 days', '<div class="dchart__big">' + gbp(bal) + '</div>' + line(series, { color: acc, id: 'bal', labels: labels }), true) +
      card('Spending this month', gbp(total), donut(parts, gbp(total), 'spent', gbp)) +
      card('Lisbon trip', 'Savings pot', ring(saved / goal, gbp(saved), 'of ' + gbp(goal), '#E0A53A') +
        '<p class="dchart__note">Round-ups added £38 this month.</p>') +
      card('Money in and out', '<i class="dkey" style="background:' + acc + '"></i>In <i class="dkey" style="background:' + acc + ';opacity:.3"></i>Out',
        bars(io, { color: acc, soft: .3, gap: .18 }), true);
    frame(host, 'Your money, read for you', 'Updated just now', insights(tips) + host.innerHTML);
  }

  window.DashCharts = { telco: telco, finance: finance };
})();
