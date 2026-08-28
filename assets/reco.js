/* ============================================================================
   Smart Recommender — JavaScript SDK campaigns
   ----------------------------------------------------------------------------
   Listens for 'ins-sr:only-api-campaign:load' and renders each campaign's
   products into the matching placeholder on the page.

   The markup below follows Track 2 of the integration guide, i.e. it carries
   the class names and data attributes Smart Recommender needs to record
   impressions, clicks, and add-to-cart. Strip those and recommendations still
   display, but the campaign analytics dashboard stays empty.

   Required structure:
     .ins-preview-wrapper-{variationId}.ins-sr-api-wrapper
       .ins-web-smart-recommender-body[data-recommended-items]
         .ins-web-smart-recommender-box-item
           .ins-product-box.ins-element-link.ins-sr-api[ins-product-id]
                                                        [data-product-categories]
                                                        [event-collection=true]
           .ins-add-to-cart-wrapper[ins-product-id] > .ins-element-link.ins-sr-api
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (window.SITE_CONFIG || {}).reco || {};
  if (CFG.enabled === false) return;

  var MAP = CFG.campaigns || {};
  var claimed = {};   // surface -> campaignId, so one campaign owns one slot

  function surfaceFor(campaignId) {
    // Explicit mapping wins.
    for (var key in MAP) {
      if (MAP[key] != null && String(MAP[key]) === String(campaignId)) return key;
    }
    // Otherwise give the campaign the first unclaimed slot present on this page.
    for (var k in MAP) {
      if (MAP[k] == null && !claimed[k] && document.getElementById('reco-' + k)) return k;
    }
    return null;
  }

  function priceOf(product) {
    var p = product.price;
    if (p && typeof p === 'object') {
      var cur = (window.SITE_CONFIG.currency) || 'USD';
      p = p[cur] != null ? p[cur] : (p.USD != null ? p.USD : Object.values(p)[0]);
    }
    return Number(p) || 0;
  }

  function render(surface, data) {
    var container = document.getElementById('reco-' + surface);
    if (!container) return;

    var products = (data && data.products) || [];
    if (!products.length) {
      container.hidden = true;
      window.insDebugNote('Smart Recommender ' + data.campaignId + ': no products, block hidden', 'warn');
      return;
    }

    claimed[surface] = data.campaignId;

    var ids = products.map(function (p) { return p.item_id; });
    var body = document.createElement('div');
    body.className = 'ins-preview-wrapper-' + data.variationId + ' ins-sr-api-wrapper';

    var strip = document.createElement('div');
    strip.className = 'ins-web-smart-recommender-body reco__strip';
    strip.setAttribute('data-recommended-items', JSON.stringify(ids));

    products.forEach(function (p) {
      var local = window.Store.byId(p.item_id);
      var name = p.name || (local && local.name) || p.item_id;
      var img = p.image_url || (local && local.image) || '';
      var href = local ? 'product.html?id=' + encodeURIComponent(p.item_id) : (p.url || '#');
      var cats = p.category || (local && local.taxonomy) || [];
      var price = priceOf(p) || (local && local.unit_sale_price) || 0;

      var item = document.createElement('div');
      item.className = 'ins-web-smart-recommender-box-item reco__item';

      var box = document.createElement('div');
      box.className = 'ins-product-box ins-element-link ins-sr-api reco__box';
      box.setAttribute('ins-product-id', p.item_id);
      box.setAttribute('data-product-categories', JSON.stringify(cats));
      box.setAttribute('event-collection', 'true');
      box.innerHTML =
        '<a href="' + href + '">' +
          '<div class="reco__media"><img loading="lazy" alt="" src="' + img + '"></div>' +
          '<p class="reco__name"></p>' +
          '<p class="reco__price"></p>' +
        '</a>';
      box.querySelector('.reco__name').textContent = name;
      box.querySelector('.reco__price').textContent = window.Store.money(price);

      var atc = document.createElement('div');
      atc.className = 'ins-add-to-cart-wrapper reco__atc';
      atc.setAttribute('ins-product-id', p.item_id);
      atc.innerHTML = '<div class="ins-element-link ins-sr-api reco__atc-btn" role="button" tabindex="0">Add to bag</div>';

      atc.addEventListener('click', function () {
        if (!local) return;
        var payload = window.Store.addToCart(local.id, 1);
        // Add-to-cart from a recommendation still needs the standard Web SDK
        // event. Smart Recommender's own attribution comes from the attributes
        // above; this push is what lands on the user profile.
        window.InsiderQueue.push({ type: 'add_to_cart', value: payload });
      });

      item.appendChild(box);
      item.appendChild(atc);
      strip.appendChild(item);
    });

    body.appendChild(strip);
    container.innerHTML = '';
    container.appendChild(body);
    container.hidden = false;

    window.insDebugNote('Smart Recommender ' + data.campaignId + ' -> #reco-' + surface +
                        ' (' + products.length + ' products)', 'ok');
  }

  function bind() {
    if (!(window.Insider && window.Insider.eventManager)) return false;
    Insider.eventManager.on('ins-sr:only-api-campaign:load', function (event, data) {
      if (!data || !data.campaignId) return;
      var surface = surfaceFor(data.campaignId);
      if (!surface) {
        window.insDebugNote('Smart Recommender campaign ' + data.campaignId +
                            ' loaded but no slot on this page', 'warn');
        return;
      }
      render(surface, data);
    });
    return true;
  }

  if (!bind()) {
    var tries = 0;
    var t = setInterval(function () {
      if (bind() || ++tries > 100) clearInterval(t);
    }, 50);
  }

  window.Reco = { render: render };
})();
