/* ============================================================================
   Eureka (Search & Merchandising) — JavaScript SDK integration
   ----------------------------------------------------------------------------
   Two surfaces are driven by Eureka here:

     category.html  ->  Insider.eureka.fetch.productListing(campId, 'Category', …)
     search.html    ->  Insider.eureka.fetch.search(campId, query, …)

   The instant-search POPUP is deliberately NOT handled in this file. A Pop-up
   campaign is designed in the panel and attaches itself to the search input;
   its logs are collected by the platform. Calling track.* for a popup variation
   would double-count, so this file never does.

   Lifecycle, per the SDK docs:
     1. wait for 'eureka:sdk:campaign:ready'  -> gives the campaign id
     2. check isOnControlGroup(campId)
     3. variation -> fetch from Eureka and render; control -> render own data
     4. BOTH groups call the same track.* method, or the A/B test is unreadable
     5. re-fetch and re-track on every sort, facet, or pagination change
   ========================================================================== */
(function () {
  'use strict';

  var CFG = (window.SITE_CONFIG || {}).eureka || {};
  var READY_TIMEOUT = 6000;

  /* --- waiting for the tag ------------------------------------------------
     ins.js loads async. Poll for the eventManager and bind as early as we can,
     so we do not miss the campaign:ready dispatch.
     ---------------------------------------------------------------------- */
  function whenInsiderReady(cb) {
    if (window.Insider && window.Insider.eventManager) return cb();
    var tries = 0;
    var t = setInterval(function () {
      if (window.Insider && window.Insider.eventManager) { clearInterval(t); cb(); }
      else if (++tries > 100) { clearInterval(t); cb(new Error('Insider tag never loaded')); }
    }, 50);
  }

  /* --- campaign discovery -------------------------------------------------
     Campaign ids come from the ready event, so nothing is hard-coded. A
     configured id in config.js only acts as a filter when several SDK
     campaigns fire on the same page.
     ---------------------------------------------------------------------- */
  function onCampaignReady(expectedId, cb) {
    var settled = false;

    function settle(campId, err) {
      if (settled) return;
      settled = true;
      cb(campId, err);
    }

    whenInsiderReady(function (err) {
      if (err) return settle(null, err);

      Insider.eventManager.on('eureka:sdk:campaign:ready', function (event, data) {
        var id = data && (data.id !== undefined ? data.id : data.campaignId);
        if (id === undefined || id === null) return;
        if (expectedId && String(expectedId) !== String(id)) return;
        settle(id, null);
      });
    });

    setTimeout(function () {
      settle(null, new Error('No Eureka SDK campaign became ready within ' + READY_TIMEOUT + 'ms'));
    }, READY_TIMEOUT);
  }

  function isControl(campId) {
    try { return !!(Insider.eureka && Insider.eureka.isOnControlGroup(campId)); }
    catch (e) { return false; }
  }

  /* --- normalising items --------------------------------------------------
     Eureka returns catalog records from salesdemo. Field naming varies by
     catalog, so map defensively and fill any gaps from the local catalog when
     the product id matches. Display never depends on one exact key.
     ---------------------------------------------------------------------- */
  function normalize(item) {
    var id = item.id || item.item_id || item.productId || item.sku;
    var local = window.Store.byId(id);
    var price = item.price;
    if (price && typeof price === 'object') {
      price = price[(window.SITE_CONFIG.currency)] || price.USD || Object.values(price)[0];
    }
    var sale = item.salePrice || item.sale_price || item.discountedPrice || price;
    if (sale && typeof sale === 'object') {
      sale = sale[(window.SITE_CONFIG.currency)] || sale.USD || Object.values(sale)[0];
    }

    return {
      id: id,
      name: item.name || item.title || (local && local.name) || id,
      taxonomy: item.category || item.taxonomy || (local && local.taxonomy) || [],
      unit_price: Number(price != null ? price : (local && local.unit_price)) || 0,
      unit_sale_price: Number(sale != null ? sale : (local && local.unit_sale_price)) || 0,
      image: item.image_url || item.imageUrl || item.image || (local && local.image) || '',
      url: item.url || (local ? 'product.html?id=' + encodeURIComponent(id) : '#'),
      _eureka: true,
      _raw: item
    };
  }

  function readResponse(response) {
    var d = (response && response.data) || {};
    return {
      items: (d.items || []).map(normalize),
      navigation: d.navigation || { total: (d.items || []).length, totalPageCount: 1 },
      facets: d.facets || d.filters || []
    };
  }

  /* --- category listing --------------------------------------------------- */
  function listing(opts) {
    var category = opts.category;
    var state = { page: 1, sorting: CFG.defaultSorting || 'Relevancy', campId: null, control: false };

    onCampaignReady(CFG.listingCampaignId, function (campId, err) {
      if (err || !campId) {
        window.insDebugNote('Eureka listing: ' + (err ? err.message : 'no campaign') +
                            ' — rendering local catalog', 'warn');
        return opts.onFallback();
      }
      state.campId = campId;
      state.control = isControl(campId);
      window.insDebugNote('Eureka listing campaign ' + campId +
                          (state.control ? ' (control group)' : ' (variation)'), 'ok');

      if (state.control) {
        // Control group renders the site's own data, then tracks identically.
        var own = opts.onFallback();
        track(own || []);
        return;
      }
      load();
    });

    function load() {
      var size = CFG.pageSize || 24;
      Insider.eureka.fetch.productListing(state.campId, 'Category', category, {
        pagination: { from: (state.page - 1) * size, size: size },
        sorting: state.sorting
      }).then(function (response) {
        var r = readResponse(response);
        window.insDebugNote('Eureka listing: ' + r.items.length + ' of ' +
                            (r.navigation.total || 0) + ' items', 'ok');
        opts.onRender(r, state);
        track(r.items, r.navigation);
      }).catch(function (e) {
        window.insDebugNote('Eureka listing fetch failed: ' + e.message, 'error');
        opts.onFallback();
      });
    }

    function track(items, navigation) {
      var size = CFG.pageSize || 24;
      var nav = navigation || { total: items.length, totalPageCount: 1 };
      try {
        Insider.eureka.track.productListingView(state.campId, category, {
          source: 'category-listing',
          pagination: {
            resultCount: nav.total,
            itemsPerPage: size,
            totalPages: nav.totalPageCount,
            currentPage: state.page
          },
          products: items.map(function (it, i) {
            return { id: it.id, price: it.unit_sale_price, displayPosition: i + 1 };
          })
        });
        window.insDebugNote('eureka.track.productListingView sent', 'ok');
      } catch (e) {
        window.insDebugNote('productListingView failed: ' + e.message, 'error');
      }
    }

    return {
      // Call on every sort / facet / pagination change — both fetch and track.
      update: function (patch) { Object.assign(state, patch); if (!state.control) load(); },
      clickProduct: function (product, position) {
        if (!state.campId) return;
        try {
          Insider.eureka.track.productClickAfterListing(state.campId, category, {
            source: 'category-listing',
            pagination: { resultCount: (product._total || 0) },
            product: { id: product.id, price: product.unit_sale_price, displayPosition: position }
          });
        } catch (e) {}
      },
      state: state
    };
  }

  /* --- search results page ------------------------------------------------ */
  function search(opts) {
    var query = opts.query;
    var state = { page: 1, sorting: CFG.defaultSorting || 'Relevancy', campId: null, control: false,
                  total: 0 };

    onCampaignReady(CFG.searchCampaignId, function (campId, err) {
      if (err || !campId) {
        window.insDebugNote('Eureka search: ' + (err ? err.message : 'no campaign') +
                            ' — rendering local results', 'warn');
        return opts.onFallback();
      }
      state.campId = campId;
      state.control = isControl(campId);
      window.insDebugNote('Eureka search campaign ' + campId +
                          (state.control ? ' (control group)' : ' (variation)'), 'ok');

      if (state.control) {
        var own = opts.onFallback();
        track(own || []);
        return;
      }
      load();
    });

    function load() {
      var size = CFG.pageSize || 24;
      Insider.eureka.fetch.search(state.campId, query, {
        pagination: { from: (state.page - 1) * size, size: size },
        sorting: state.sorting
      }).then(function (response) {
        var r = readResponse(response);
        state.total = r.navigation.total || r.items.length;
        window.insDebugNote('Eureka search "' + query + '": ' + r.items.length + ' of ' +
                            state.total, 'ok');
        opts.onRender(r, state);
        track(r.items, r.navigation);
      }).catch(function (e) {
        window.insDebugNote('Eureka search fetch failed: ' + e.message, 'error');
        opts.onFallback();
      });
    }

    function track(items, navigation) {
      var size = CFG.pageSize || 24;
      var nav = navigation || { total: items.length, totalPageCount: 1 };
      try {
        Insider.eureka.track.search(state.campId, query, {
          pagination: {
            resultCount: nav.total,
            itemsPerPage: size,
            totalPages: nav.totalPageCount,
            currentPage: state.page
          },
          products: items.map(function (it, i) {
            return { id: it.id, price: it.unit_sale_price, displayPosition: i + 1 };
          })
        });
        window.insDebugNote('eureka.track.search sent', 'ok');
      } catch (e) {
        window.insDebugNote('track.search failed: ' + e.message, 'error');
      }
    }

    return {
      update: function (patch) { Object.assign(state, patch); if (!state.control) load(); },
      clickProduct: function (product, position) {
        if (!state.campId) return;
        try {
          Insider.eureka.track.productClickAfterSearch(state.campId, query, {
            pagination: { resultCount: state.total },
            product: {
              id: product.id, price: product.unit_sale_price,
              displayPosition: position, clickPosition: position
            }
          });
          window.insDebugNote('eureka.track.productClickAfterSearch: ' + product.id, 'ok');
        } catch (e) {}
      },
      addToCart: function (product, position) {
        if (!state.campId) return;
        try {
          // Click must always be sent before add-to-cart.
          Insider.eureka.track.productClickAfterSearch(state.campId, query, {
            pagination: { resultCount: state.total },
            product: { id: product.id, price: product.unit_sale_price, displayPosition: position }
          });
          Insider.eureka.track.productAddToCartAfterSearch(state.campId, query, {
            pagination: { resultCount: state.total },
            product: { id: product.id, price: product.unit_sale_price, displayPosition: position }
          });
          window.insDebugNote('eureka.track.productAddToCartAfterSearch: ' + product.id, 'ok');
        } catch (e) {}
      },
      state: state
    };
  }

  window.Eureka = { listing: listing, search: search, normalize: normalize, enabled: CFG.enabled !== false };
})();
