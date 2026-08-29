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
      '.ins-web-smart-recommender-box-item .card{display:block;' +
      'text-decoration:none;color:inherit}' +
      '.ins-web-smart-recommender-box-item .card__media{position:relative;' +
      'aspect-ratio:1/1;overflow:hidden;background:var(--alt)}' +
      '.ins-web-smart-recommender-box-item .card__media img{width:100%;' +
      'height:100%;object-fit:cover;display:block}';
    document.head.appendChild(css);
  }

  function render(host, products, campaignId, variationId) {
    ensureStyle();
    host.innerHTML = '';

    var body = document.createElement('div');
    body.className = 'ins-web-smart-recommender-body recs__grid';

    products.forEach(function (raw, i) {
      var p = normalize(raw);

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

      var priceEl = box.querySelector('.card__price');
      var money = (window.Store && window.Store.money) || function (n) { return n; };
      if (sale) {
        priceEl.innerHTML = '<s class="was"></s> <span class="now"></span>';
        priceEl.querySelector('.was').textContent = money(p.unit_price);
        priceEl.querySelector('.now').textContent = money(p.unit_sale_price);
      } else {
        priceEl.textContent = money(p.unit_price);
      }

      item.appendChild(box);
      body.appendChild(item);
    });

    host.appendChild(body);
    host.hidden = false;
    note('Smart Recommender ' + campaignId + '/' + variationId + ': ' +
         products.length + ' products', 'ok');
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
