/* ============================================================================
   Smart Recommender — JavaScript SDK integration
   ----------------------------------------------------------------------------
   Renders an API-based Smart Recommender campaign into a host element.

   HOW THIS DIFFERS FROM EUREKA

   Eureka is request/response: you call fetch.search() and get a promise back.
   Smart Recommender is event-based. The tag resolves the campaign during init
   and announces the result:

       Insider.eventManager.once('ins-sr:only-api-campaign:load', fn)
           -> { campaignId, variationId, products }

   That is the whole API. There is no fetch to call, no way to ask "is there a
   campaign for this page", and no error event when there isn't one.

   THE TIMING PROBLEM

   The event fires when the tag finishes resolving campaigns, which can be
   before this file runs. `once` binds a listener; whether it replays an event
   already fired is not documented. So this file does both:

       1. bind the listener, in case the event has not fired yet
       2. poll a short while for an already-resolved payload, in case it has

   Whichever arrives first wins; the other is ignored. Same class of race as
   `eureka:sdk:campaign:ready`, handled the same way.

   MARKUP CONTRACT

   The panel's integration notes require specific class names for click
   tracking and analytics to attribute correctly:

       .ins-web-smart-recommender-body        the widget body
       .ins-web-smart-recommender-box-item    one per product
       .ins-product-box.ins-element-link.ins-sr-api
       ins-product-id="<id>"                  on the product box
       data-product-categories="<taxonomy>"
       event-collection="true"

   These are not decorative. Omitting them means clicks are not recorded
   against the campaign and the Purchases goal has nothing to attribute to.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (window.SITE_CONFIG || {});
  var RECO = CFG.reco || {};

  function note(text, tone) {
    if (window.insDebugNote) window.insDebugNote(text, tone || 'info');
  }

  /* --- normalising ---------------------------------------------------------
     Smart Recommender returns the catalog fields flat on each product, in the
     same shape the feed supplied. Fall back to the local catalog for anything
     missing so a partial record still renders.
     ---------------------------------------------------------------------- */
  function normalize(p) {
    var id = String(p.id || p.item_id || p.productId || '');
    var local = (window.Store && window.Store.byId) ? window.Store.byId(id) : null;

    function price(v) {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      if (typeof v === 'object') {
        var cur = (window.ENVIRONMENT && window.ENVIRONMENT.currency) || 'EUR';
        if (v[cur] != null) return v[cur];
        var keys = Object.keys(v);
        return keys.length ? v[keys[0]] : null;
      }
      return Number(v);
    }

    var sale = price(p.price != null ? p.price : p.unit_sale_price);
    var full = price(p.original_price != null ? p.original_price : p.unit_price);
    if (full == null || full <= 0) full = sale;

    var taxonomy = p.category || p.taxonomy || (local && local.taxonomy) || [];
    if (typeof taxonomy === 'string') taxonomy = [taxonomy];

    return {
      id: id,
      // Needed to collapse variants — a route with four cabins comes back as
      // four products. Prefer the feed's value, fall back to the local record.
      groupcode: p.groupcode || (p.custom && p.custom.product_id) ||
                 (local && local.groupcode) || id,
      name: p.name || p.title || (local && local.name) || id,
      image: p.image_url || p.image || (local && local.image) || '',
      unit_price: Number(full) || 0,
      unit_sale_price: Number(sale != null ? sale : full) || 0,
      taxonomy: taxonomy,
      subcategory: taxonomy[taxonomy.length - 1] || '',
      // Keep visitors on the demo site: use the local URL when we have the
      // product, and only fall back to whatever the platform returned.
      url: local ? window.Store.localHref(local) : (p.url || '#')
    };
  }

  /* --- rendering ----------------------------------------------------------
     The widget markup carries Insider's required class names for click
     tracking, and the site's own `.card` classes for styling. Those two are
     independent: the tracking classes have no CSS, and the layout has to be
     supplied here because `.grid` is not on this container.
     ---------------------------------------------------------------------- */
  var STYLE_ID = 'ins-recs-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent =
      '.ins-web-smart-recommender-body{display:grid;' +
      'grid-template-columns:repeat(auto-fill,minmax(13rem,1fr));' +
      'gap:1.5rem 1.25rem}' +
      '.ins-web-smart-recommender-box-item{min-width:0}' +
      // The strategy strip sits above the grid, so it must escape the grid's
      // own column flow — hence the explicit grid-column span.
      '.reco__strategy{grid-column:1/-1;display:flex;gap:.75rem;align-items:flex-start;' +
      'padding:.875rem 1rem;margin-bottom:.25rem;border:1px solid var(--rule,#e5e5e5);' +
      'border-radius:4px;background:var(--alt,#fafafa)}' +
      '.reco__strategy-icon{flex:0 0 auto;display:flex;color:var(--accent,#666);' +
      'margin-top:.1rem}' +
      '.reco__strategy-name{margin:0;font-size:.875rem;font-weight:500;' +
      'display:flex;align-items:center;gap:.5rem}' +
      '.reco__strategy-group{font-size:.6875rem;letter-spacing:.06em;' +
      'text-transform:uppercase;color:var(--muted,#777);border:1px solid var(--rule,#e5e5e5);' +
      'border-radius:2px;padding:.05rem .35rem}' +
      '.reco__strategy-blurb{margin:.2rem 0 0;font-size:.8125rem;color:var(--muted,#666);' +
      'line-height:1.5}' +
      '.reco__strategy-needs{margin:.25rem 0 0;font-size:.75rem;color:var(--muted,#888);' +
      'opacity:.85}' +
      '.reco__strategy-more{margin:.5rem 0 0;padding:0;border:0;background:none;' +
      'font:inherit;font-size:.75rem;color:var(--accent,#666);cursor:pointer;' +
      'border-bottom:1px solid currentColor;line-height:1.2}' +
      '.reco__strategy-detail{margin:.7rem 0 0;padding-top:.65rem;' +
      'border-top:1px solid var(--rule,#e5e5e5);max-width:44rem}' +
      '.reco__strategy-dt{margin:.55rem 0 .1rem;font-size:.6875rem;letter-spacing:.06em;' +
      'text-transform:uppercase;color:var(--muted,#999)}' +
      '.reco__strategy-dt:first-child{margin-top:0}' +
      '.reco__strategy-dd{margin:0;font-size:.8125rem;line-height:1.55;color:var(--ink,#444)}' +
      '.ins-web-smart-recommender-box-item .card{display:block;' +
      'text-decoration:none;color:inherit}' +
      '.ins-web-smart-recommender-box-item .card__media{position:relative;' +
      'aspect-ratio:1/1;overflow:hidden;background:var(--alt)}' +
      '.ins-web-smart-recommender-box-item .card__media img{width:100%;' +
      'height:100%;object-fit:cover;display:block}';
    document.head.appendChild(css);
  }

  /* --- the strategy strip -------------------------------------------------
     A row of products is not evidence of anything on its own — a prospect
     cannot tell a personalised recommendation from a hard-coded list. So say
     which algorithm produced it and what that algorithm reads.

     The tag does not report the strategy: `ins-sr:only-api-campaign:load`
     carries campaignId, variationId and products, nothing else. So it is
     declared per campaign in config.js and has to be kept in step with the
     panel by hand. If it is missing, the strip is skipped rather than guessed.
     ---------------------------------------------------------------------- */
  var ICONS = {
    similar:       '<circle cx="8" cy="12" r="4.2"/><circle cx="16" cy="12" r="4.2"/>',
    image:         '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-5 4 4 3-2 4 4"/>',
    complementary: '<rect x="3.5" y="4" width="8" height="8" rx="1.6"/><rect x="12.5" y="12" width="8" height="8" rx="1.6"/><path d="M11.5 8h3.5a2 2 0 0 1 2 2v2"/>',
    together:      '<circle cx="9" cy="9" r="3.2"/><circle cx="16" cy="15" r="3.2"/><path d="M11.4 11.2l2.6 2.2"/>',
    cart:          '<path d="M3 4h2.2l2.4 10.4h9.8L20 7H6"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    user:          '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6"/>',
    trend:         '<path d="M4 17l5-5 3.5 3.5L20 8"/><path d="M20 8h-4.5M20 8v4.5"/>',
    'new':         '<path d="M12 3.5l2.4 5.2 5.6.7-4.1 3.9 1.1 5.6L12 16.2 6.9 18.9 8 13.3 3.9 9.4l5.6-.7z"/>',
    tag:           '<path d="M11 3.5H4.5V10l9.5 9.5 6.5-6.5z"/><circle cx="8" cy="8" r="1.3"/>',
    auto:          '<path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="3.4"/>'
  };

  function strategyStrip(host) {
    if (RECO.showStrategy === false) return;
    var acct = (window.ENVIRONMENT || {}).account;
    var per = (RECO.perAccount || {})[acct] || {};
    var def = (RECO.strategies || {})[per.strategy];
    if (!def) return;

    var wrap = document.createElement('div');
    wrap.className = 'reco__strategy';

    var icon = document.createElement('span');
    icon.className = 'reco__strategy-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
                     'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
                     'stroke-linejoin="round" aria-hidden="true">' +
                     (ICONS[def.icon] || ICONS.similar) + '</svg>';

    var text = document.createElement('div');
    var head = document.createElement('p');
    head.className = 'reco__strategy-name';
    head.textContent = def.label;
    if (def.group) {
      var tag = document.createElement('span');
      tag.className = 'reco__strategy-group';
      tag.textContent = def.group;
      head.appendChild(tag);
    }
    text.appendChild(head);

    if (def.blurb) {
      var p = document.createElement('p');
      p.className = 'reco__strategy-blurb';
      p.textContent = def.blurb;
      text.appendChild(p);
    }
    if (def.needs) {
      var n = document.createElement('p');
      n.className = 'reco__strategy-needs';
      n.textContent = def.needs;
      text.appendChild(n);
    }

    /* The three questions that come up in every recommendations demo:
       where does this one shine, what does it pair with, and what is it bad
       at. Behind a toggle rather than in the strip, so the widget stays a
       widget — but on the page rather than in someone's head, because the SC
       should not have to improvise the answer.

       The caveat is deliberately included. A strategy sheet that only lists
       strengths reads as marketing; one that names the trade-off reads as
       someone who has deployed it. */
    var detail = [
      ['Where to put it', def.placement],
      ['Where it shines', def.where],
      ['Pairs well with', def.pairs],
      ['The trade-off', def.caveat]
    ].filter(function (r) { return r[1]; });

    if (detail.length) {
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'reco__strategy-more';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = 'Why this strategy';

      var panel = document.createElement('div');
      panel.className = 'reco__strategy-detail';
      panel.hidden = true;
      detail.forEach(function (row) {
        var dt = document.createElement('p');
        dt.className = 'reco__strategy-dt';
        dt.textContent = row[0];
        var dd = document.createElement('p');
        dd.className = 'reco__strategy-dd';
        dd.textContent = row[1];
        panel.appendChild(dt);
        panel.appendChild(dd);
      });

      toggle.addEventListener('click', function () {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
        toggle.textContent = panel.hidden ? 'Why this strategy' : 'Hide';
      });

      text.appendChild(toggle);
      text.appendChild(panel);
    }

    wrap.appendChild(icon);
    wrap.appendChild(text);
    host.appendChild(wrap);
  }

  function addMore(row, n) {
    var more = document.createElement('span');
    more.className = 'card__more';
    more.textContent = '+' + n;
    row.appendChild(more);
  }

  function render(host, products, campaignId, variationId) {
    ensureStyle();
    host.innerHTML = '';
    strategyStrip(host);

    var body = document.createElement('div');
    body.className = 'ins-web-smart-recommender-body recs__grid';

    /* Smart Recommender returns one row per VARIANT, so a recommended flight
       arrives as four near-identical cards. Collapse the same way every other
       surface does. The count is logged rather than shown, so the console
       still tells you what the campaign actually returned. */
    var normalized = products.map(normalize);
    var shown = normalized;
    if (window.Store && typeof window.Store.oneVariantEach === 'function') {
      try {
        shown = window.Store.oneVariantEach(normalized);
        if (shown.length < normalized.length) {
          note('Collapsed ' + normalized.length + ' recommended variants to ' +
               shown.length + ' products', 'ok');
        }
      } catch (e) { shown = normalized; }
    }

    shown.forEach(function (raw, i) {
      var p = raw;

      var item = document.createElement('div');
      item.className = 'ins-web-smart-recommender-box-item';

      var box = document.createElement('a');
      box.className = 'ins-product-box ins-element-link ins-sr-api card';
      box.href = p.url;
      box.setAttribute('ins-product-id', p.id);
      box.setAttribute('data-product-categories', p.taxonomy.join(','));
      box.setAttribute('event-collection', 'true');

      var sale = p.unit_sale_price < p.unit_price;
      box.innerHTML =
        '<div class="card__media">' +
          (sale ? '<span class="badge">Sale</span>' : '') +
          '<img loading="lazy" alt="" src="' + p.image + '">' +
        '</div>' +
        '<div class="card__meta">' +
          '<p class="card__vendor"></p>' +
          '<h3 class="card__name"></h3>' +
          '<p class="card__price"></p>' +
        '</div>';

      box.querySelector('.card__vendor').textContent = p.subcategory;
      box.querySelector('.card__name').textContent = p.name;

      // Same variant preview as the site's own cards — swatches where the
      // tokens are colours, chips where they are sizes, cabins or tiers.
      if (p._variants > 1 && window.Store && window.Store.variantFacets) {
        var f = { swatches: [], chips: [] };
        try { f = window.Store.variantFacets(p); } catch (e) {}
        var meta = box.querySelector('.card__meta');
        var priceNode = box.querySelector('.card__price');
        var row = null;
        if (f.swatches.length > 1) {
          row = document.createElement('div');
          row.className = 'card__swatches';
          f.swatches.slice(0, 6).forEach(function (sw) {
            var dot = document.createElement('span');
            dot.className = 'swatch';
            dot.style.background = sw.hex;
            dot.title = sw.label;
            row.appendChild(dot);
          });
          if (f.swatches.length > 6) addMore(row, f.swatches.length - 6);
        } else if (f.chips.length > 1) {
          row = document.createElement('div');
          row.className = 'card__chips';
          f.chips.slice(0, 4).forEach(function (label) {
            var chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = label;
            row.appendChild(chip);
          });
          if (f.chips.length > 4) addMore(row, f.chips.length - 4);
        } else {
          row = document.createElement('p');
          row.className = 'card__variant';
          row.textContent = p._variants + ' ' +
            (((window.VERTICAL || {}).labels || {}).variants || 'options');
        }
        if (row) meta.insertBefore(row, priceNode);
      }

      var priceEl = box.querySelector('.card__price');
      var money = (window.Store && window.Store.money) || function (n) { return n; };
      var from = p._variants > 1 ? 'from ' : '';
      if (sale) {
        priceEl.innerHTML = '<s class="was"></s> <span class="now"></span>';
        priceEl.querySelector('.was').textContent = money(p.unit_price);
        priceEl.querySelector('.now').textContent = from + money(p.unit_sale_price);
      } else {
        priceEl.textContent = from + money(p.unit_price);
      }

      item.appendChild(box);
      body.appendChild(item);
    });

    host.appendChild(body);
    host.hidden = false;
    note('Smart Recommender ' + campaignId + '/' + variationId + ': ' +
         shown.length + ' products', 'ok');
  }

  /* --- waiting for the campaign -------------------------------------------
     The event fires once, during tag init, and does not replay: binding a
     listener afterwards catches nothing (verified — `once` returns a handle
     and no payload arrives). And it cannot be bound at file-load time either,
     because `Insider.eventManager` does not exist until ins.js has run.

     So poll for eventManager itself, at a short interval, and attach the
     listener the moment it appears. That is early enough to be ahead of
     campaign resolution while not depending on script order.

     There is no fetch alternative: the campaign object carries a strategyId
     but no products, and the tag exposes no Smart Recommender namespace. The
     event is the only route.
     ---------------------------------------------------------------------- */
  function onRecommendation(cb) {
    var done = false;
    var bound = false;

    function deliver(data) {
      if (done || !data) return;
      done = true;
      cb(data);
    }

    function tryBind() {
      if (bound) return true;
      try {
        var em = window.Insider && Insider.eventManager;
        if (!em || !em.once) return false;
        em.once('ins-sr:only-api-campaign:load', function (ev, data) {
          deliver(data);
        });
        // Some builds dispatch the plural form; binding both is harmless.
        if (em.on) {
          em.on('ins-sr:only-api-campaign:load', function (ev, data) {
            deliver(data);
          });
        }
        bound = true;
        return true;
      } catch (e) { return false; }
    }

    // Bind immediately if the tag is already there, otherwise watch for it.
    if (!tryBind()) {
      var bindTimer = setInterval(function () {
        if (tryBind()) clearInterval(bindTimer);
      }, 20);
      setTimeout(function () { clearInterval(bindTimer); }, 20000);
    }

    // Give up quietly. No campaign is a legitimate outcome — the widget
    // simply does not appear — so this is a note rather than an error.
    setTimeout(function () {
      if (!done) {
        note('Smart Recommender: no campaign resolved for this page', 'warn');
      }
    }, 20000);
  }

  /* --- public ------------------------------------------------------------- */
  var pending = null;   // payload that arrived before mount() was called
  var mounts = [];      // hosts waiting for a payload

  // Start listening the moment this file runs, not when mount() is called.
  // mount() is invoked from the bottom of the page; campaign resolution can
  // easily beat it.
  onRecommendation(function (data) {
    pending = data;
    mounts.splice(0).forEach(function (m) { m(data); });
  });

  window.Recs = {
    enabled: RECO.enabled !== false,

    // mount('#reco-product', { title: 'You might also like' })
    mount: function (target, opts) {
      opts = opts || {};
      var host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) return;
      host.hidden = true;

      function paint(data) {
        var products = data.products || [];
        if (!products.length) {
          note('Smart Recommender returned no products', 'warn');
          return;
        }
        if (opts.title) {
          var h = document.createElement('h2');
          h.className = 'recs__title';
          h.textContent = opts.title;
          host.parentNode.insertBefore(h, host);
        }
        render(host, products, data.campaignId, data.variationId);
      }

      if (pending) paint(pending);
      else mounts.push(paint);
    }
  };
})();
