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

  /* --- the active environment ---------------------------------------------
     vertical.js resolves account, partnerId, locale and currency from the
     hostname and puts them on window.ENVIRONMENT. (window.VERTICAL is a
     different thing — the catalog object with brand, theme and labels.)
     Read defensively: this file must not break if it has not loaded yet.
     ---------------------------------------------------------------------- */
  function environment() {
    return window.ENVIRONMENT || {};
  }

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

     NOTE: config.js now leaves searchCampaignId / listingCampaignId null by
     default. Campaign ids are per ACCOUNT and the account is chosen by
     hostname, so a hard-coded global id sends every vertical to the same
     account's campaign. Discovery below reads what the panel is actually
     serving on this page, which is correct per account by construction.

     Returns { ids, sawPool }. `sawPool` distinguishes "this account has no
     Eureka campaigns at all" from "campaigns exist but none apply here" —
     two very different problems that otherwise look identical.
     ---------------------------------------------------------------------- */
  function discoverCampaignId() {
    var out = [];
    var sawPool = false;
    try {
      var io = window.Insider && (window.Insider.insiderObject || window.Insider.campaign);
      var pools = [];
      if (window.Insider) {
        ['eurekaCampaigns', 'campaigns', 'activeCampaigns'].forEach(function (k) {
          if (window.Insider[k]) pools.push(window.Insider[k]);
        });
        if (window.Insider.systemRules) pools.push(window.Insider.systemRules);
      }
      if (io && io.campaigns) pools.push(io.campaigns);

      pools.forEach(function (pool) {
        var list = Array.isArray(pool) ? pool : Object.keys(pool || {}).map(function (k) {
          return pool[k];
        });
        if (list.length) sawPool = true;
        list.forEach(function (c) {
          if (!c) return;
          var id = c.campId || c.campaignId || c.id;
          if (id && out.indexOf(id) === -1) out.push(id);
        });
      });
    } catch (e) {}
    return { ids: out, sawPool: sawPool };
  }

  /* --- why did we not get a campaign? -------------------------------------
     One fallback message for four different causes is exactly the silent
     failure this platform specialises in. Name the cause instead.
     ---------------------------------------------------------------------- */
  function diagnose(surface) {
    var acct = environment().account || 'unknown account';

    if (!window.Insider) {
      return 'Eureka ' + surface + ': the Insider tag never loaded. Check the ' +
             'script tag, and check this hostname is in multiDomains for ' +
             acct + ' — a missing domain loads the tag but sends nothing.';
    }
    if (!window.Insider.eureka) {
      return 'Eureka ' + surface + ': the tag loaded but exposes no eureka API. ' +
             'Eureka is probably not enabled on ' + acct + '.';
    }

    var found = discoverCampaignId();
    if (!found.sawPool) {
      return 'Eureka ' + surface + ': no Eureka campaign found on ' + acct + '. ' +
             'Most likely there is not one yet — indexing a locale does not ' +
             'create a campaign. Campaigns > Search and Merchandising > new ' +
             'campaign, JavaScript SDK type, locale ' +
             (environment().locale || 'en_GB') + '.';
    }
    return 'Eureka ' + surface + ': campaigns exist on ' + acct + ' (' +
           found.ids.join(', ') + ') but none is serving this page. Check the ' +
           "campaign's page targeting and that it is live, not draft.";
  }

  /* --- campaign readiness -------------------------------------------------
     Originally this waited on 'eureka:sdk:campaign:ready'. That event does not
     reliably reach a listener bound after the tag has already initialised —
     which is always, because the tag loads async and we can only bind once it
     exists. So: bind the event as a fast path, but also poll for a campaign id
     and probe it. Whichever answers first wins.
     ---------------------------------------------------------------------- */
  function onCampaignReady(expectedId, cb) {
    var settled = false;

    function settle(campId, err) {
      if (settled) return;
      settled = true;
      cb(campId, err);
    }

    if (expectedId) {
      // Explicitly configured — no discovery needed. Only set this when
      // several Eureka campaigns run on the same page, and set it per
      // account in config.js `perAccount`, never globally.
      whenInsiderReady(function (err) { settle(err ? null : expectedId, err); });
      return;
    }

    whenInsiderReady(function (err) {
      if (err) return settle(null, err);

      // Fast path: the event, if it happens to fire after we bind.
      try {
        Insider.eventManager.on('eureka:sdk:campaign:ready', function (event, data) {
          var id = data && (data.id !== undefined ? data.id : data.campaignId);
          if (id != null) settle(id, null);
        });
      } catch (e) {}

      // Reliable path: find the campaign the panel is already serving here.
      var tries = 0;
      var poll = setInterval(function () {
        if (settled) return clearInterval(poll);
        var found = discoverCampaignId();
        if (found.ids.length) {
          clearInterval(poll);
          settle(found.ids[0], null);
        } else if (++tries > 60) {
          clearInterval(poll);
        }
      }, 100);
    });

    setTimeout(function () {
      settle(null, new Error('No Eureka SDK campaign became ready within ' + READY_TIMEOUT + 'ms'));
    }, READY_TIMEOUT);
  }

  function isControl(campId) {
    try { return !!(Insider.eureka && Insider.eureka.isOnControlGroup(campId)); }
    catch (e) { return false; }
  }

  /* --- prices -------------------------------------------------------------
     Eureka returns prices as currency-keyed objects, e.g. { EUR: 42.00 }.
     Prefer the active vertical's currency, then EUR (the catalogue locale is
     en_GB / EUR), then USD, then whatever is there. Never return nothing just
     because the expected key is missing — a wrong-but-present price is far
     easier to spot than a silent 0.00.
     ---------------------------------------------------------------------- */
  function pickCurrency(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object') {
      var cur = environment().currency ||
                (window.SITE_CONFIG && window.SITE_CONFIG.currency) ||
                'EUR';
      if (v[cur] != null) return v[cur];
      if (v.EUR != null) return v.EUR;
      if (v.USD != null) return v.USD;
      var vals = Object.keys(v).map(function (k) { return v[k]; });
      return vals.length ? vals[0] : null;
    }
    return Number(v);
  }

  /* --- normalising items --------------------------------------------------
     Eureka returns product fields in one of two shapes depending on account
     and locale configuration:

       nested:  item.itemProperties.item_card.{name,price,...}
       flat:    item.itemProperties.{name,price,...}

     partnersandbox / en_GB returns the FLAT shape. Read item_card when it is
     there, otherwise fall back to itemProperties itself, then to a variant,
     then to the item. Prices are per-currency objects and category is an
     array in both shapes.

     If names come back as bare ids and prices as 0.00, none of these matched
     — which usually means the campaign being queried belongs to a different
     account or locale, with a differently shaped catalog. Check the campaign
     id and the locale in the console line before debugging this function.
     ---------------------------------------------------------------------- */
  function normalize(item) {
    var props = item.itemProperties || {};
    var card = props.item_card ||
               (Object.keys(props).length ? props : null) ||
               (item.itemVariants && item.itemVariants[0]) ||
               item;

    var id = String(card.item_id || item.itemId || card.id || '').split(':')[0];
    var local = window.Store.byId(id);

    var price = pickCurrency(card.price);
    var original = pickCurrency(card.original_price);
    // `price` is what the customer pays; `original_price` is the was-price.
    var unitPrice = original != null && original > 0 ? original : price;
    var salePrice = price != null ? price : unitPrice;

    var cat = card.category;
    if (typeof cat === 'string') cat = [cat];

    // stock_count is the flat shape's quantity field; in_stock is the flag.
    var stock = card.in_stock != null ? card.in_stock
              : (card.stock_count != null ? (card.stock_count > 0 ? 1 : 0) : 1);

    return {
      id: id,
      groupcode: card.groupcode || (item.contentGroupId || '').replace('groupcode:', ''),
      name: card.name || card.title || (local && local.name) || id,
      taxonomy: cat || (local && local.taxonomy) || [],
      subcategory: (cat && cat[cat.length - 1]) || (local && local.subcategory) || '',
      collection: (cat && cat[0]) || (local && local.collection) || '',
      vendor: card.brand || (local && local.vendor) || '',
      unit_price: Number(unitPrice != null ? unitPrice : (local && local.unit_price)) || 0,
      unit_sale_price: Number(salePrice != null ? salePrice : (local && local.unit_sale_price)) || 0,
      image: card.image_url || card.image || (local && local.image) || '',
      variant_label: (local && local.variant_label) || null,
      in_stock: stock,
      // Products in our own catalog get a local link; anything else keeps the
      // URL Eureka returned, which may point off-site.
      url: local ? window.Store.localHref(local) : (card.url || '#'),
      _eureka: true,
      _raw: item
    };
  }

  function readResponse(response) {
    var d = (response && response.data) || {};
    return {
      // 'Success' means the query matched. 'SuccessFallback' means it matched
      // NOTHING and Eureka substituted recommendations — see scopeFallback().
      status: (response && response.status) || null,
      items: (d.items || []).map(normalize),
      navigation: d.navigation || { total: (d.items || []).length, totalPageCount: 1 },
      facets: d.aggregations || d.facets || d.filters || []
    };
  }

  /* --- category listing --------------------------------------------------- */
  /* --- vertical scoping ---------------------------------------------------
     One catalog serves all twelve verticals, so every Eureka request has to
     be constrained to the vertical the hostname resolved to. Without it the
     beauty store searches all 17,092 products and returns supermarket
     biscuits for "lipstick".

     The value is the top level of the category path — `Beauty` in
     `Beauty > Makeup > Lip`. build.py writes it from the vertical's
     `subvertical` field, and it lands on every record's taxonomy, so read it
     from the catalog rather than duplicating the config here. That way a new
     vertical needs no change in this file.

     Scoping site-side rather than per-campaign means one shared campaign
     serves every vertical, which is the whole point of the single-locale
     design.
     ---------------------------------------------------------------------- */
  function verticalName() {
    // Explicit config wins, if a vertical ever needs to override it.
    if (CFG.verticalCategory) return CFG.verticalCategory;
    var v = window.VERTICAL || {};
    if (v.vertical_label) return v.vertical_label;
    var first = (window.Store && window.Store.catalog && window.Store.catalog[0]) || null;
    if (first && first.taxonomy && first.taxonomy.length) return first.taxonomy[0];
    return null;
  }

  // Eureka takes filters as `a={field}~{value}` pairs; the SDK wraps that as
  // a facets array. `category` is the facet configured on the en_GB locale.
  function verticalFacet(extra) {
    var name = verticalName();
    var facets = (extra || []).slice();
    if (name) facets.push({ field: 'category', values: [name] });
    return facets;
  }

  /* --- fallback scoping ---------------------------------------------------
     THE PROBLEM. When a query matches nothing, Eureka returns
     status 'SuccessFallback' with substitute products — and it DROPS the
     facets we sent. So the vertical filter above is silently ignored on
     exactly the path where a wrong result is most visible: search "sofa" on
     beauty and you get supermarket biscuits, linking off to
     supermarket.insiderdemo.com. A prospect clicking one leaves the vertical.

     Fixing it needs no panel work: every item carries `category` as an array
     whose first element is the vertical, so filter client-side.

     Comparison is deliberately loose. The category path uses the PLURAL
     display form (`Supermarkets > Ingredients > All`) while the vertical key
     is singular (`supermarket`). An equality test would drop every
     supermarket result and reproduce Friday's silent-empty bug in a new
     place. catKey() lowercases, strips non-letters and trims a trailing 's'
     so both forms collapse to the same token.

     Fails OPEN: if the vertical cannot be resolved, nothing is filtered. A
     slightly wrong result beats an empty page you cannot explain.
     ---------------------------------------------------------------------- */
  function catKey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '');
  }

  function inVertical(item, key) {
    var top = (item.taxonomy && item.taxonomy[0]) || item.collection || '';
    return catKey(top) === key;
  }

  /* Returns the response unchanged unless it is a fallback, in which case the
     items are cut to the current vertical. `surface` is only for logging. */
  function scopeFallback(r, surface) {
    if (r.status !== 'SuccessFallback') return r;

    var name = verticalName();
    if (!name) {
      window.insDebugNote('Eureka ' + surface + ': no matches, and the vertical could ' +
                          'not be resolved, so fallback results are unscoped.', 'warn');
      return r;
    }

    var key = catKey(name);
    var before = r.items.length;
    var kept = r.items.filter(function (it) { return inVertical(it, key); });

    window.insDebugNote('Eureka ' + surface + ': no matches. Eureka returned ' + before +
                        ' fallback items ignoring our category facet; ' + kept.length +
                        ' are in ' + name + '.', 'warn');

    r.items = kept;
    r.navigation = { total: kept.length, totalPageCount: 1 };
    r.fallback = true;
    return r;
  }

  function listing(opts) {
    var category = opts.category;
    var state = { page: 1, sorting: CFG.defaultSorting || 'Relevancy', campId: null, control: false };

    onCampaignReady(CFG.listingCampaignId, function (campId, err) {
      if (err || !campId) {
        window.insDebugNote(diagnose('listing'), 'warn');
        window.insDebugNote('Rendering local catalog instead.', 'warn');
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
        sorting: state.sorting,
        facets: verticalFacet(state.facets)
      }).then(function (response) {
        var r = scopeFallback(readResponse(response), 'listing');

        // Nothing left after scoping — show our own catalog rather than an
        // empty grid or another vertical's products.
        if (!r.items.length) {
          window.insDebugNote('Rendering local catalog instead.', 'warn');
          return opts.onFallback();
        }

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
        window.insDebugNote(diagnose('search'), 'warn');
        window.insDebugNote('Rendering local results instead.', 'warn');
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
        sorting: state.sorting,
        facets: verticalFacet(state.facets)
      }).then(function (response) {
        var r = scopeFallback(readResponse(response), 'search "' + query + '"');

        // Nothing in this vertical matched, and the substitutes were all from
        // other verticals. Hand back to the site's own search, which renders a
        // proper no-results state from the local catalog.
        if (!r.items.length) {
          window.insDebugNote('No results in this vertical. Rendering local results instead.', 'warn');
          return opts.onFallback();
        }

        state.total = r.navigation.total || r.items.length;
        window.insDebugNote('Eureka search "' + query + '": ' + r.items.length + ' of ' +
                            state.total + (r.fallback ? ' (fallback, scoped to vertical)' : ''), 'ok');
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
