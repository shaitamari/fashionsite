/* ============================================================================
   In-session affinity — a working exhibit, not a feature
   ----------------------------------------------------------------------------
   WHAT THIS IS

   The platform builds attribute affinities — which colours, categories and
   brands a person leans toward — from months of behaviour across sessions and
   devices. On a fresh account there is nothing: Attribute Affinity needs 30
   days plus a thousand weekly product views before it says anything, and it
   then refreshes weekly.

   So the capability cannot be shown on this estate, which makes it impossible
   to argue for. This file exists to make the argument visible: it derives the
   same KIND of signal from the current session, in the browser, and uses it to
   reorder results and swap the hero.

   WHAT IT IS NOT

   It is not the platform's model and does not pretend to be. That model is a
   trained classifier over six months of cross-session, cross-device behaviour
   with real statistical weight behind it. This is a decayed counter over the
   last few minutes on one device. It reacts faster and knows vastly less.

   The panel says so on screen, and every console note is labelled site-side,
   so nobody who inherits this can mistake it for platform output.

   HOW IT IS ISOLATED

   Off unless explicitly enabled, and enabled only by hand:

       ?affinity=1   turn on, remembered in localStorage
       ?affinity=0   turn off and forget

   With it off, this file returns before doing anything. It has its own storage
   key and its own DOM node, writes to no shared state, and the only hook into
   the rest of the codebase is a wrapper around Store.grid installed at
   runtime. Delete the script tag and everything reverts exactly.
   ========================================================================== */
(function () {
  'use strict';

  var KEY   = 'lmn.affinity';        // the event log
  var FLAG  = 'lmn.affinity.on';     // whether the exhibit is enabled
  var TAU   = 8 * 60 * 1000;         // decay constant: ~8 minutes
  var MAX   = 60;                    // events kept

  /* --- the gate ----------------------------------------------------------- */
  function enabled() {
    var q = new URLSearchParams(location.search).get('affinity');
    if (q === '1') { try { localStorage.setItem(FLAG, '1'); } catch (e) {} return true; }
    if (q === '0') {
      try { localStorage.removeItem(FLAG); localStorage.removeItem(KEY); } catch (e) {}
      return false;
    }
    try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }

  if (!enabled()) return;

  /* --- the event log ------------------------------------------------------ */
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) {}
  }

  /* Record one signal. `dim` is the dimension (category, colour, discount),
     `value` the observed value, `weight` how much this interaction counts —
     a product view is worth more than a category page. */
  /* `key` is what gets matched, `label` is what gets shown.

     For colour these differ, and it matters. The catalogue carries "Blue",
     "Baby Blue", "Rich Blue" and "Dark Navy" as separate tokens, so matching
     on the literal string means browsing baby blue builds no affinity for a
     dress labelled blue — which is not what anyone means by a colour
     preference. Colours are therefore keyed by the hex their family resolves
     to, so the whole family counts as one signal, while the panel still shows
     the words actually seen. */
  function record(dim, value, weight, key) {
    if (!dim || !value) return;
    var list = read();
    list.push({ d: dim, v: String(value), k: String(key || value),
                w: weight || 1, t: Date.now() });
    write(list);
  }

  /* Colour families.

     The catalogue carries "Navy", "Dark Navy", "Rich Blue", "Baby Blue" and
     "Blue" as separate tokens, and matching on the literal string means each
     builds its own signal — so a shopper who has plainly been looking at blue
     dresses gets no blue preference at all, just five weak ones.

     A person who looks at navy and then at cobalt has a preference for blue.
     These groupings say so. They are deliberately coarse: wine is kept apart
     from red, and beige from brown, because those genuinely are different
     preferences on a rail rather than different words for one. */
  var FAMILIES = {
    blue:   ['navy', 'cobalt', 'azure', 'denim', 'indigo', 'marine', 'agate',
             'powder', 'sky', 'blue'],
    teal:   ['turquoise', 'aqua', 'cyan', 'teal'],
    green:  ['mint', 'sage', 'olive', 'moss', 'forest', 'lichen', 'lime',
             'jade', 'nori', 'emerald', 'green'],
    red:    ['crimson', 'chilli', 'scarlet', 'ruby', 'red'],
    wine:   ['burgundy', 'maroon', 'oxblood', 'merlot', 'wine', 'cherry'],
    pink:   ['blush', 'rose', 'magenta', 'fuchsia', 'coral', 'salmon',
             'raspberry', 'pink'],
    purple: ['violet', 'lilac', 'lavender', 'plum', 'mulberry', 'mauve', 'purple'],
    orange: ['apricot', 'peach', 'rust', 'terra', 'copper', 'bronze',
             'tangerine', 'safflower', 'orange'],
    yellow: ['butter', 'mustard', 'gold', 'honey', 'amber', 'champagne',
             'lemon', 'yellow'],
    brown:  ['chocolate', 'cocoa', 'espresso', 'chestnut', 'walnut', 'caramel',
             'mocha', 'tortoiseshell', 'tort', 'coffee', 'brown'],
    beige:  ['sandstone', 'almond', 'taupe', 'nude', 'oat', 'biscuit', 'latte',
             'camel', 'sand', 'tan', 'beige', 'oyster', 'pebble'],
    white:  ['ivory', 'cream', 'chalk', 'vanilla', 'pearl', 'coconut', 'cloud',
             'opalite', 'white'],
    grey:   ['charcoal', 'slate', 'granite', 'silver', 'pewter', 'steel',
             'stone', 'platinum', 'titanium', 'grey', 'gray'],
    black:  ['black', 'jet', 'onyx']
  };

  var FAMILY_WORDS = (function () {
    var out = [];
    Object.keys(FAMILIES).forEach(function (fam) {
      FAMILIES[fam].forEach(function (w) { out.push({ w: w, fam: fam }); });
    });
    // Longest word first, so "sandstone" is not read as "sand" and
    // "tortoiseshell" is not read as "tort".
    return out.sort(function (a, b) { return b.w.length - a.w.length; });
  })();

  /* The family a token belongs to, or its hex as a fallback for colours the
     list does not cover, so an unrecognised word still groups with itself. */
  function colourKey(token) {
    var t = String(token || '').toLowerCase();
    if (!t) return null;
    var best = null, at = Infinity;
    FAMILY_WORDS.forEach(function (e) {
      var i = t.indexOf(e.w);
      // Earliest match wins: "Carolina Blue" is blue, "Dark Navy" is blue.
      if (i > -1 && i < at) { at = i; best = e.fam; }
    });
    if (best) return best;
    return (window.Store && window.Store.swatchHex && window.Store.swatchHex(token)) || null;
  }

  /* Score with exponential decay, so the signal follows the visitor rather
     than accumulating forever. Something looked at a minute ago outweighs
     something from twenty minutes back, which is what makes the reordering
     visibly follow behaviour during a walkthrough. */
  function scores(dim) {
    var now = Date.now(), out = {};
    read().forEach(function (e) {
      if (e.d !== dim) return;
      var k = e.k || e.v;
      var decay = Math.exp(-(now - e.t) / TAU);
      var slot = out[k] || (out[k] = { key: k, score: 0, labels: {} });
      slot.score += e.w * decay;
      slot.labels[e.v] = (slot.labels[e.v] || 0) + 1;
    });
    return Object.keys(out).map(function (k) {
      var slot = out[k];
      // Show the wording most often seen for this family.
      var label = Object.keys(slot.labels).sort(function (a, b) {
        return slot.labels[b] - slot.labels[a];
      })[0];
      /* Show the family name when there is one — "Blue" rather than whichever
         of Navy, Rich Blue or Baby Blue happened to be seen most, since the
         family is what the preference actually is. */
      if (dim === 'colour' && FAMILIES[slot.key]) {
        label = slot.key.charAt(0).toUpperCase() + slot.key.slice(1);
      }
      return { value: label, key: slot.key, score: slot.score };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  function top(dim) {
    var s = scores(dim);
    return s.length ? s[0] : null;
  }

  /* --- observing ---------------------------------------------------------- */
  /* Colour comes from the variant label, split and classified the same way
     store.js does it, because the feed fuses colour and size into one string.
     See feed-fixes.md #1. */
  function coloursOf(product) {
    if (!product || !window.Store || !window.Store.swatchHex) return [];
    var vs = (window.Store.variantsOf ? window.Store.variantsOf(product) : [product]);
    var out = {}, list = [];
    vs.forEach(function (v) {
      String(v.variant_label || v.color || '').split('/').forEach(function (raw) {
        var tok = raw.trim();
        if (tok && window.Store.swatchHex(tok) && !out[tok]) { out[tok] = 1; list.push(tok); }
      });
    });
    return list;
  }

  function observe() {
    var params = new URLSearchParams(location.search);

    // A product view is the strongest signal available.
    var id = params.get('id');
    if (id && window.Store && window.Store.byId) {
      var p = window.Store.byId(id);
      if (p) {
        record('category', (p.taxonomy || [])[1] || p.collection, 3);
        coloursOf(p).forEach(function (c) { record('colour', c, 2, colourKey(c)); });
        if (p.unit_sale_price < p.unit_price) record('discount', 'sale', 3);
        else record('discount', 'full', 1);
      }
    }

    // A category page is weaker but still intent.
    var c = params.get('c');
    if (c) record('category', c, 1);

    // So is a search that names a colour.
    var q = (params.get('q') || '').trim();
    if (q && window.Store && window.Store.swatchHex) {
      q.split(/\s+/).forEach(function (w) {
        if (window.Store.swatchHex(w)) record('colour', w, 2);
      });
    }
  }

  /* --- ranking ------------------------------------------------------------
     A STABLE sort, deliberately. Products with no affinity signal keep the
     order the platform gave them, and affinity only breaks ties. Relevance
     still governs; this reorders within it rather than replacing it — which
     is also what Eureka's own affinity personalisation does. */
  function rank(items) {
    if (!items || items.length < 2) return items;
    var cat = {}, col = {};
    scores('category').forEach(function (e) { cat[e.value] = e.score; });
    scores('colour').forEach(function (e) { col[e.key] = e.score; });   // by family
    if (!Object.keys(cat).length && !Object.keys(col).length) return items;

    var scored = items.map(function (p, i) {
      var s = 0;
      var pc = (p.taxonomy || [])[1] || p.collection;
      if (pc && cat[pc]) s += cat[pc] * 2;
      var seenKeys = {};
      coloursOf(p).forEach(function (c) {
        var k = colourKey(c);
        if (k && col[k] && !seenKeys[k]) { seenKeys[k] = 1; s += col[k]; }
      });
      return { p: p, s: s, i: i };
    });
    scored.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      return a.i - b.i;                     // stable: original order wins ties
    });
    return scored.map(function (x) { return x.p; });
  }

  /* --- the hero ------------------------------------------------------------
     The most legible change on the site: same page, different opening,
     according to what this visitor has been looking at. Copy is per top
     category, with a discount variant that wins when sale-browsing dominates. */
  /* Keyed by the second level of the category path, which is what `observe()`
     records. Beauty and fashion only — the two verticals where a homepage
     that reacts to browsing is a story anyone buys. Anything not listed here
     leaves the original hero copy alone, which is why the exhibit degrades
     quietly rather than writing beauty copy onto a bank. */
  var HERO = {
    // Fashion — Ashford Lane
    'Tops':         { eyebrow: 'Because you have been looking at tops',
                      title: 'Start at the top.',
                      lede: 'The layer everything else is built around.',
                      cta: 'Shop tops', href: 'category.html?c=Tops' },
    'Maxi Dresses': { eyebrow: 'Because you have been looking at maxi dresses',
                      title: 'Full length.',
                      lede: 'For the evenings that ask for it.',
                      cta: 'Shop maxi dresses', href: 'category.html?c=Maxi%20Dresses' },
    'Mini Dresses': { eyebrow: 'Because you have been looking at mini dresses',
                      title: 'Short story.',
                      lede: 'Cut to move, made to be seen.',
                      cta: 'Shop mini dresses', href: 'category.html?c=Mini%20Dresses' },
    'Dresses':      { eyebrow: 'Because you have been looking at dresses',
                      title: 'One decision.',
                      lede: 'The whole outfit, sorted in a single piece.',
                      cta: 'Shop dresses', href: 'category.html?c=Dresses' },
    'Pants':        { eyebrow: 'Because you have been looking at trousers',
                      title: 'Cut properly.',
                      lede: 'Tailoring that holds its line all day.',
                      cta: 'Shop trousers', href: 'category.html?c=Pants' },
    'Outerwear':    { eyebrow: 'Because you have been looking at outerwear',
                      title: 'Weather permitting.',
                      lede: 'The piece everyone sees first.',
                      cta: 'Shop outerwear', href: 'category.html?c=Outerwear' },

    // Beauty — Lumen
    Makeup:    { eyebrow: 'Because you have been looking at makeup',
                 title: 'Colour, considered.',
                 lede: 'Shades built to layer, wear and rewear.',
                 cta: 'Shop makeup', href: 'category.html?c=Makeup' },
    Skincare:  { eyebrow: 'Because you have been looking at skincare',
                 title: 'Skin first.',
                 lede: 'Daily steps that do the quiet work.',
                 cta: 'Shop skincare', href: 'category.html?c=Skincare' },
    Fragrance: { eyebrow: 'Because you have been looking at fragrance',
                 title: 'Scent that stays.',
                 lede: 'Worn close, remembered longer.',
                 cta: 'Shop fragrance', href: 'category.html?c=Fragrance' },
    Body:      { eyebrow: 'Because you have been looking at body care',
                 title: 'Everyday care.',
                 lede: 'The unglamorous things, done properly.',
                 cta: 'Shop body', href: 'category.html?c=Body' }
  };

  /* The sale hero is vertical-agnostic, so its CTA points at whatever the
     first collection of this store happens to be rather than a hard-coded
     beauty category. */
  var HERO_SALE = { eyebrow: 'Because you have been browsing the sale',
                    title: 'Still on sale.',
                    lede: 'Reduced this season, while the sizes last.',
                    cta: 'Shop the sale', href: null };

  function saleHref() {
    var c = (window.Store && window.Store.collections && window.Store.collections()) || [];
    return c.length ? 'category.html?c=' + encodeURIComponent(c[0]) : 'index.html';
  }

  function swapHero() {
    var hero = document.querySelector('[data-hero-title]');
    if (!hero) return;

    var d = top('discount');
    var c = top('category');
    var pick = null;

    // Sale browsing wins only when it is clearly dominant, so one discounted
    // product does not rewrite the homepage.
    var sale = scores('discount').filter(function (e) { return e.value === 'sale'; })[0];
    var full = scores('discount').filter(function (e) { return e.value === 'full'; })[0];
    if (sale && sale.score > 4 && (!full || sale.score > full.score * 1.5)) pick = HERO_SALE;
    else if (c && HERO[c.value]) pick = HERO[c.value];
    if (!pick) return;

    /* Name the colour in the eyebrow when there is a clear one. It is the most
       legible form the exhibit takes — the line says exactly what was learned,
       so nobody has to be told what changed. Only when the leading colour is
       clearly ahead, or the hero starts claiming a preference off one glance. */
    var eyebrow = pick.eyebrow;
    var cols = scores('colour');
    if (cols.length && cols[0].score > 2 &&
        (!cols[1] || cols[0].score > cols[1].score * 1.4) &&
        pick !== HERO_SALE) {
      eyebrow += ' in ' + cols[0].value.toLowerCase();
    }
    set('[data-hero-eyebrow]', eyebrow);
    setHTML('[data-hero-title]', pick.title);
    set('[data-hero-lede]', pick.lede);
    var cta = document.querySelector('[data-hero-cta]');
    if (cta) { cta.textContent = pick.cta; cta.href = pick.href || saleHref(); }

    /* The image too, or the change is only half made — copy swaps and the
       photograph underneath still shows whatever the homepage always showed.
       index.html sets this to the first featured product; here it becomes a
       product from whatever the visitor has actually been looking at, so the
       whole hero moves together. */
    swapHeroImage(pick);

    note('hero swapped to "' + pick.title + '"');

    function set(sel, v) {
      document.querySelectorAll(sel).forEach(function (n) { n.textContent = v; });
    }
    function setHTML(sel, v) {
      document.querySelectorAll(sel).forEach(function (n) { n.innerHTML = v; });
    }
  }

  /* Choose the picture from the catalogue, matching whatever drove the copy.
     Prefers a product carrying a top colour as well as the top category, so
     someone who has been looking at burgundy gets a burgundy hero. */
  function swapHeroImage(pick) {
    var img = document.getElementById('hero-img');
    var cat = (window.Store && window.Store.catalog) || [];
    if (!img || !cat.length) return;

    var wantCat = (top('category') || {}).value;
    var wantCol = (top('colour') || {}).value;
    var sale = pick && pick.title === HERO_SALE.title;

    var pool = cat.filter(function (p) {
      if (!p.image) return false;
      if (sale) return p.unit_sale_price < p.unit_price;
      var pc = (p.taxonomy || [])[1] || p.collection;
      return !wantCat || pc === wantCat;
    });
    if (!pool.length) return;

    // Within the pool, prefer one that also matches the top colour.
    var best = pool[0];
    if (wantCol) {
      var wantKey = colourKey(wantCol);
      for (var i = 0; i < pool.length; i++) {
        var match = coloursOf(pool[i]).some(function (c) { return colourKey(c) === wantKey; });
        if (match) { best = pool[i]; break; }
      }
    }
    if (best && best.image) {
      img.src = best.image;
      img.alt = best.name || '';
      note('hero image \u2192 ' + (best.name || best.id));
    }
  }

  /* --- the panel ----------------------------------------------------------- */
  function bars(dim, limit) {
    var s = scores(dim).slice(0, limit || 4);
    if (!s.length) return '<p class="afx__none">nothing yet</p>';
    var max = s[0].score || 1;
    return s.map(function (e) {
      var pct = Math.max(4, Math.round((e.score / max) * 100));
      return '<div class="afx__row">' +
               '<span class="afx__k">' + esc(e.value) + '</span>' +
               '<span class="afx__bar"><i style="width:' + pct + '%"></i></span>' +
             '</div>';
    }).join('');
  }

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintPanel() {
    var host = document.getElementById('afx');
    if (!host) return;
    var body = host.querySelector('.afx__body');
    body.innerHTML =
      '<p class="afx__dim">Category</p>' + bars('category') +
      '<p class="afx__dim">Colour</p>' + bars('colour') +
      '<p class="afx__dim">Price</p>' + bars('discount', 2) +
      '<p class="afx__foot">Derived in this browser, this session. The platform ' +
      'builds the same kind of signal from months of behaviour across sessions ' +
      'and devices, refreshed daily. This is a stand-in so the mechanic is ' +
      'visible on a new account \u2014 it reacts faster and knows far less.</p>' +
      '<button type="button" class="afx__reset">Forget everything</button>' +
      '<button type="button" class="afx__off">Turn the exhibit off</button>';

    /* Forget everything clears the event log but leaves the exhibit ON, which
       is right when you want to restart a demo from a clean profile. */
    body.querySelector('.afx__reset').addEventListener('click', function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      location.reload();
    });

    /* Off switch. The flag lives in localStorage, so once the exhibit is
       enabled it stays enabled on every page load until somebody remembers
       the ?affinity=0 querystring. That has already cost time: affinity
       silently overrode an onsite campaign's hero and looked like the campaign
       was broken. An exhibit that is hard to turn off is a trap, so put the
       switch where the exhibit is.

       Reloads without the querystring, so a stale ?affinity=1 in the address
       bar cannot immediately switch it back on. */
    body.querySelector('.afx__off').addEventListener('click', function () {
      try {
        localStorage.removeItem(FLAG);
        localStorage.removeItem(KEY);
      } catch (e) {}
      var clean = location.origin + location.pathname +
        location.search.replace(/([?&])affinity=[^&]*/g, '$1').replace(/[?&]$/, '');
      location.href = clean;
    });
  }

  function buildPanel() {
    if (document.getElementById('afx')) return;
    var el = document.createElement('div');
    el.id = 'afx';
    el.innerHTML =
      '<button type="button" class="afx__toggle">Affinity <span class="afx__tag">site-side</span></button>' +
      '<div class="afx__body" hidden></div>';
    document.body.appendChild(el);

    var body = el.querySelector('.afx__body');
    el.querySelector('.afx__toggle').addEventListener('click', function () {
      body.hidden = !body.hidden;
      if (!body.hidden) paintPanel();
    });
    paintPanel();
  }

  var STYLE = '' +
    '#afx{position:fixed;left:1rem;bottom:1rem;z-index:9999;font-family:inherit;' +
      'max-width:19rem}' +
    '#afx .afx__toggle{display:flex;align-items:center;gap:.4rem;border:1px solid #2e2e2e;' +
      'background:#18181B;color:#f4f2f0;border-radius:999px;padding:.45rem .85rem;' +
      'font:inherit;font-size:.75rem;cursor:pointer}' +
    '#afx .afx__tag{font-size:.625rem;letter-spacing:.06em;text-transform:uppercase;' +
      'background:#EE3524;color:#fff;border-radius:2px;padding:.05rem .3rem}' +
    '#afx .afx__body{margin-top:.5rem;background:#18181B;color:#e9e6e3;border-radius:6px;' +
      'padding:.9rem 1rem;font-size:.75rem;line-height:1.5;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.28)}' +
    '#afx .afx__dim{margin:.7rem 0 .35rem;font-size:.625rem;letter-spacing:.08em;' +
      'text-transform:uppercase;color:#9b9691}' +
    '#afx .afx__dim:first-child{margin-top:0}' +
    '#afx .afx__row{display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem}' +
    '#afx .afx__k{flex:0 0 7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#afx .afx__bar{flex:1;height:5px;background:#2c2c30;border-radius:3px;overflow:hidden}' +
    '#afx .afx__bar i{display:block;height:100%;background:linear-gradient(90deg,#FF6B27,#EA332D)}' +
    '#afx .afx__none{margin:0;color:#7d7873}' +
    '#afx .afx__foot{margin:.9rem 0 .6rem;padding-top:.7rem;border-top:1px solid #2c2c30;' +
      'font-size:.6875rem;color:#9b9691;line-height:1.45}' +
    '#afx .afx__off{display:block;width:100%;margin-top:.4rem;padding:.45rem;font:inherit;font-size:.75rem;color:#EE3524;background:transparent;border:1px solid #EE3524;border-radius:4px;cursor:pointer}.afx__off:hover{background:#EE3524;color:#fff}.afx__reset{border:1px solid #3a3a3e;background:none;color:#c9c4bf;' +
      'border-radius:3px;padding:.3rem .6rem;font:inherit;font-size:.6875rem;cursor:pointer}';

  function note(text) {
    if (window.insDebugNote) window.insDebugNote('affinity (site-side): ' + text, 'ok');
  }

  /* --- wiring -------------------------------------------------------------
     One hook into the rest of the codebase: a wrapper around Store.grid, so
     every grid the site renders is reordered. Installed at runtime and
     removed with this file. recs.js calls window.Affinity.rank itself, behind
     a guard, so it is a no-op when this file is absent. */
  function hookGrid() {
    if (!window.Store || !window.Store.grid || window.Store.grid.__afx) return;
    var original = window.Store.grid;
    var wrapped = function (target, products, opts) {
      var ranked = rank(products);
      var moved = ranked.some(function (p, i) { return p !== products[i]; });

      /* Reorder the caller's array IN PLACE rather than passing a new one.

         Pages keep their own reference to the array they handed in and use the
         card's DOM index to look the product back up — search.html does this
         for Eureka click tracking. Handing the grid a reordered copy leaves
         the DOM in one order and the page's array in another, so a click on
         the first card reports whichever product used to be first. Splicing
         the original array keeps both in step. */
      if (moved && Array.isArray(products)) {
        products.length = 0;
        Array.prototype.push.apply(products, ranked);
        note('reordered ' + products.length + ' products by affinity');
      }
      return original.call(window.Store, target, products, opts);
    };
    wrapped.__afx = true;
    window.Store.grid = wrapped;
  }

  window.Affinity = { rank: rank, scores: scores, top: top, enabled: true };

  document.addEventListener('DOMContentLoaded', function () {
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);

    observe();
    hookGrid();
    buildPanel();
    swapHero();
    note('exhibit active \u2014 add ?affinity=0 to turn it off');
  });
})();
