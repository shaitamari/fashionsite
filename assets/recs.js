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

  /* --- rendering ---------------------------------------------------------- */
  function render(host, products, campaignId, variationId) {
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

  /* --- waiting for the campaign ------------------------------------------- */
  function onRecommendation(cb) {
    var done = false;
    function deliver(data) {
      if (done || !data) return;
      done = true;
      cb(data);
    }

    // 1. The documented path.
    try {
      if (window.Insider && Insider.eventManager && Insider.eventManager.once) {
        Insider.eventManager.once('ins-sr:only-api-campaign:load', function (ev, data) {
          deliver(data);
        });
      }
    } catch (e) {}

    // 2. In case the event fired before this file ran. The tag keeps the
    //    resolved payload on the campaign object, so poll briefly for it.
    var tries = 0;
    var timer = setInterval(function () {
      if (done || ++tries > 60) { clearInterval(timer); return; }
      try {
        var camp = window.Insider && Insider.campaign &&
                   Insider.campaign.get(RECO.variationId);
        if (camp && camp.products && camp.products.length) {
          clearInterval(timer);
          deliver({ campaignId: RECO.campaignId,
                    variationId: RECO.variationId,
                    products: camp.products });
        }
      } catch (e) {}
    }, 250);

    // 3. Give up quietly. No campaign is a legitimate outcome — the widget
    //    simply does not appear — so this is a note rather than an error.
    setTimeout(function () {
      if (!done) {
        clearInterval(timer);
        note('Smart Recommender: no campaign resolved for this page', 'warn');
      }
    }, 16000);
  }

  /* --- public ------------------------------------------------------------- */
  window.Recs = {
    enabled: RECO.enabled !== false,

    // mount('#reco', { title: 'You might also like' })
    mount: function (target, opts) {
      opts = opts || {};
      var host = typeof target === 'string' ? document.querySelector(target) : target;
      if (!host) return;
      host.hidden = true;

      onRecommendation(function (data) {
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
      });
    }
  };
})();
