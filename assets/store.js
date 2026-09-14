/* ============================================================================
   Store runtime — Posh Street demo

   Every record in the catalog is a Shopify VARIANT, because that is what the
   salesdemo catalog is keyed on. `id` is the variant id, `groupcode` is the
   product id — matching exactly what the live Posh site sends for the same
   products, so both sites write consistent catalog records.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = { visitor: 'lmn.visitor', cart: 'lmn.cart', user: 'lmn.user', wish: 'lmn.wishlist' };

  function read(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* --- visitor identity ---------------------------------------------------
     The uuid must NEVER change, signed in or not.

     Insider's Identity Resolution treats uuid as an identifier, and merges
     an anonymous profile into a known one only when an incoming request
     shares an identifier value with the existing profile. If the uuid is
     swapped for the account id at sign-in, the two sessions have no shared
     identifier and Insider correctly creates two unrelated profiles — the
     anonymous browsing history is stranded and the "becomes known" moment
     produces an empty profile.

     So: one stable uuid for the lifetime of the browser, and let email
     arrive on top of it at sign-in. Then the uuid links the sessions on this
     device and email links the person across devices, which is what the
     identifier priority (email 1, uuid 3) is designed for.

     The account id is still sent, as a custom attribute, so it is visible on
     the profile without participating in matching.
     ---------------------------------------------------------------------- */
  /* The visitor id lives in a cookie on the parent domain (insiderdemo.com),
     the same scope as the tag's own cookies, so every storefront in this
     browser pushes the same uuid. localStorage is per hostname; keeping the
     id there gave each store its own uuid while the tag session was shared,
     and the platform refused the second uuid. */
  var VISITOR_COOKIE = 'lmn_visitor';
  function cookieDomain() {
    var parts = location.hostname.split('.');
    return parts.length > 2 ? '.' + parts.slice(-2).join('.') : location.hostname;
  }
  function readVisitorCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + VISITOR_COOKIE + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeVisitorCookie(id) {
    var base = VISITOR_COOKIE + '=' + encodeURIComponent(id) + '; path=/; max-age=31536000; SameSite=Lax';
    document.cookie = base + '; domain=' + cookieDomain();
    document.cookie = base;  // localhost and single-label hosts
    write(KEY.visitor, id);  // mirror for the pages that read it directly
  }
  function clearVisitorCookie() {
    ['; domain=' + cookieDomain(), ''].forEach(function (d) {
      document.cookie = VISITOR_COOKIE + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT' + d;
    });
    localStorage.removeItem(KEY.visitor);
  }
  /* Runs once per page: if this store still remembers a user whose uuid is
     not the estate-wide visitor id, that user was set on another store or
     replaced since. Drop the local copy; the platform session is the
     cookie's person, and the header should say so. */
  (function reconcileLocalUser() {
    try {
      var cookieId = readVisitorCookie();
      var u = read(KEY.user, null);
      if (cookieId && u && u.uuid && u.uuid !== cookieId) {
        localStorage.removeItem(KEY.user);
      }
    } catch (e) {}
  })();
  function visitorId() {
    var id = readVisitorCookie() || read(KEY.visitor, null);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : 'anon-' + Math.random().toString(36).slice(2) + Date.now());
    }
    if (readVisitorCookie() !== id) writeVisitorCookie(id);
    return id;
  }

  function resetVisitor() {
    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {
      localStorage.removeItem(k);
    });
    clearVisitorCookie();
    /* End the tag's session too. Otherwise the tag keeps its profile and the
       site pushes a fresh random uuid into it; a saved visitor picked next
       then cannot attach its own uuid to that profile. */
    clearInsiderIdentity();
    location.hash = 'reid';
    location.reload();
  }

  /* --- catalog ------------------------------------------------------------ */
  var catalog = window.CATALOG || [];
  var index = {};
  catalog.forEach(function (p) { index[p.id] = p; });

  function byId(id) { return index[String(id)] || null; }

  /* --- variant swatches and chips ------------------------------------------
     Cards collapse to one per groupcode (see oneVariantEach), which hides how
     many colours or sizes a product comes in. This restores that as a swatch
     row or a text chip row under the name.

     The catalogs are borrowed Shopify data, so `variant_label` is a compound
     option string rather than clean fields: fashion gives "Chocolate / AU 4",
     home gives "Queen + Headboard / Sandstone / Black". The `color` column is
     no better — it holds the same compound string. So split on "/" and
     classify each token instead of trusting the columns.

     A token becomes a SWATCH only if it contains a recognised colour word;
     everything else becomes a text CHIP. That is deliberately conservative:
     Glossier shade names like "Puff" or "Storm" have no knowable colour, and
     a wrong swatch reads worse than a word.

     Which means no per-vertical configuration. Fashion and telco get
     swatches because their tokens are colours; hotels, banking and airlines
     get chips because theirs are room types, tiers and cabins. The data
     decides.
     ---------------------------------------------------------------------- */
  var COLOR_WORDS = {
    black:'#1c1c1c', white:'#f7f5f2', ivory:'#f2ead9', cream:'#f3e9d6', chalk:'#ece9e3',
    grey:'#8d8d8d', gray:'#8d8d8d', charcoal:'#3a3a3a', slate:'#5a6672', granite:'#6f6f6f',
    silver:'#c5c8ca', platinum:'#d8d8d5', steel:'#7c8a96', stainless:'#b6bcc0',
    navy:'#1f2a4a', blue:'#2f5fa8', cobalt:'#1c4fa1', azure:'#3f7fd0', sky:'#8fc0e8',
    denim:'#4a6c8c', indigo:'#333a6b', marine:'#20456b', teal:'#1f6f6b', turquoise:'#3fb3ab',
    aqua:'#79cfd0', agate:'#5b7fa6',
    green:'#3d7a4a', mint:'#b7e0c4', sage:'#a3b39a', olive:'#6b6b3a', moss:'#5c6b4a',
    forest:'#22432c', lichen:'#9aa88a', lime:'#b6d84a', jade:'#3f8f77', nori:'#33473b',
    red:'#b23b34', chilli:'#c0392b', cherry:'#8f2233', wine:'#6b2434', burgundy:'#5c2233',
    maroon:'#5e2028', ruby:'#9b1b3a', coral:'#e0715f', salmon:'#e79c86',
    pink:'#e3a2b5', blush:'#edc3c6', rose:'#d98a95', raspberry:'#a8365c', magenta:'#b5399a',
    fuchsia:'#c2439a', lilac:'#c3b0d8', lavender:'#c0b3d9', violet:'#7d5aa6', purple:'#6b4a8f',
    plum:'#6a3a56', mulberry:'#6d3d55',
    orange:'#d9803f', apricot:'#e8b184', peach:'#f0c3a6', terra:'#b5674a', rust:'#a75a3a',
    yellow:'#e3c14a', butter:'#f0dfa0', mustard:'#c9a227', honey:'#d9a441', gold:'#bfa14a',
    champagne:'#e5d5b8', amber:'#c98f2b', bronze:'#9a6f42', copper:'#b06f4a',
    brown:'#6b4a37', chocolate:'#4a3128', cocoa:'#5a3f33', espresso:'#3e2b25',
    chestnut:'#6b4230', walnut:'#5b4034', oak:'#b9985f', birch:'#ddd0b8',
    almond:'#e2d3bd', beige:'#ded2bd', tan:'#c9ab86', camel:'#b8956a', caramel:'#b5793f',
    sand:'#ddc9a6', sandstone:'#cbb493', stone:'#c2bbae', taupe:'#a8998a', pebble:'#c8c2b6',
    oyster:'#ded6c8', vanilla:'#f0e5cc', pearl:'#eee8e0', opalite:'#dfe4e6',
    clear:'#eef1f3', tortoiseshell:'#7a4a26', safflower:'#e08a3c', coastal:'#a8c3d4',
    floral:'#d6a8bd', mauve:'#a9808f', tort:'#7a4a26', cloud:'#eef0f1', pewter:'#8f8d88', tiger:'#c98a3a', zebra:'#3a3a3a', strawberry:'#c8455a',
    mango:'#e59a3c', coconut:'#f0e8da', fig:'#5c4358', starry:'#4a5570'
  };

  // Longest colour word first, so "sandstone" wins over "sand" and
  // "tortoiseshell" over "shell".
  var COLOR_KEYS = Object.keys(COLOR_WORDS).sort(function (a, b) { return b.length - a.length; });

  function swatchHex(token) {
    var t = String(token || '').toLowerCase();
    if (!t) return null;
    // Pure sizes never carry colour, and "Blue 8" style tokens are rare.
    if (/^[\d\s.,/+-]+(ml|cm|mm|g|kg|l|oz|"|in)?$/.test(t)) return null;
    var best = null, bestAt = Infinity;
    for (var i = 0; i < COLOR_KEYS.length; i++) {
      var at = t.indexOf(COLOR_KEYS[i]);
      // Earliest colour word in the string wins: "Carolina Blue" -> blue,
      // "Dark Navy" -> navy, "Sheer Twinkle Silver" -> silver.
      if (at > -1 && at < bestAt) { bestAt = at; best = COLOR_KEYS[i]; }
    }
    return best ? COLOR_WORDS[best] : null;
  }

  // groupcode -> every variant record, built once.
  var groups = {};
  catalog.forEach(function (p) {
    var k = p.groupcode || ('_' + p.id);
    (groups[k] = groups[k] || []).push(p);
  });

  /* Find every variant of a product.

     Eureka is inconsistent about groupcode across its two response shapes:
     fallback items come back flat with `groupcode` present, but search results
     are nested under `item_card`, which is a display subset that can omit it.
     When that happens the key misses, the product looks like a group of one,
     and the card shows a lone "Coral Red / AU 4" instead of a size row — while
     the local-catalogue fallback right next to it groups correctly.

     So try the group key, and if that misses, look the product up by id in our
     own catalog and use ITS groupcode. Every product Eureka can return is in
     the local catalog, so this always resolves. */
  /* --- colourways ---------------------------------------------------------
     On a real fashion site, a colour swatch navigates to a DIFFERENT product
     and sizes are the SKUs within it. The catalog is already in that shape —
     one groupcode per colourway, sizes inside — but nothing links the
     colourways to each other. This builds that link.

     Styles are matched by name, since the same style in two colours arrives
     as two products with the same invented brand+style name. That is not
     perfect: of 117 fashion styles spanning several groupcodes, 47 are
     genuine colourways, 6 are the same colour twice (name collisions from
     the rebranding step) and 64 have no clean colour token because colour is
     fused into `variant_label`. So this only renders where the colours are
     real and distinct, and stays silent otherwise.

     The proper fix is in the feed — a separate `color` field, which the XML
     already carries and only the local catalog lacks. Until then, this. */
  var SIZE_TOKEN = /^(xxs|xs|s|m|l|xl|xxl|one ?size|au ?\d+|uk ?\d+|eu ?\d+|\d+(\.\d+)?\s*(cm|mm|ml|g|kg|l)?)$/i;

  // A group's colour is the first variant token that is not a size, and only
  // when the whole group agrees on it.
  function colourOfGroup(list) {
    var found = {};
    list.forEach(function (p) {
      var first = String(p.variant_label || p.color || '').split('/')[0].trim();
      if (first && !SIZE_TOKEN.test(first)) found[first] = 1;
    });
    var keys = Object.keys(found);
    return keys.length === 1 ? keys[0] : null;
  }

  // style name -> [{ colour, hex, groupcode, href }], only where >1 distinct colour
  var styleColourways = {};
  (function buildColourways() {
    var byName = {};
    catalog.forEach(function (p) {
      if (!p.name) return;
      var n = byName[p.name] || (byName[p.name] = {});
      (n[p.groupcode] || (n[p.groupcode] = [])).push(p);
    });
    Object.keys(byName).forEach(function (name) {
      var gcs = Object.keys(byName[name]);
      if (gcs.length < 2) return;
      var out = [], seen = {};
      gcs.forEach(function (gc) {
        var colour = colourOfGroup(byName[name][gc]);
        if (!colour || seen[colour]) return;   // unparseable, or a duplicate colour
        seen[colour] = 1;
        var cheapest = byName[name][gc][0];
        byName[name][gc].forEach(function (x) {
          var a = Number(x.unit_sale_price) || Number(x.unit_price) || Infinity;
          var b = Number(cheapest.unit_sale_price) || Number(cheapest.unit_price) || Infinity;
          if (a < b) cheapest = x;
        });
        out.push({ colour: colour, hex: swatchHex(colour) || '#cfcfcf',
                   groupcode: gc, href: localHref(cheapest) });
      });
      if (out.length > 1) styleColourways[name] = out;
    });
  })();

  function colourways(p) {
    return (p && styleColourways[p.name]) || [];
  }

  var warnedGroupless = false;
  function variantsOf(p) {
    if (!p) return [];
    var direct = groups[p.groupcode || ('_' + p.id)];
    if (direct && direct.length > 1) return direct;

    var local = byId(p.id);
    if (local && local.groupcode) {
      var viaLocal = groups[local.groupcode];
      if (viaLocal && viaLocal.length > 1) {
        if (!warnedGroupless && window.insDebugNote) {
          warnedGroupless = true;
          window.insDebugNote('Eureka returned products without a usable groupcode; ' +
                              'variants resolved from the local catalog instead.', 'warn');
        }
        return viaLocal;
      }
    }
    return direct || [p];
  }

  /* Build facets from Eureka's own variant data, when we have it.

     Smart Variant Grouping is enabled, so Eureka returns the other variants in
     `itemVariants` with SEPARATE `size` and `color` fields. That is strictly
     better than parsing our local compound label ("Coral Red / AU 4"), because
     it is the platform's own view of the catalog and needs no guessing about
     which half of the string is a colour. */
  function facetsFromEureka(list) {
    var sw = [], ch = [], seenSw = {}, seenCh = {};
    list.forEach(function (v) {
      /* `color` and `size` are separate fields here, but the feed writes the
         WHOLE compound label into whichever one it picks — g:color comes back
         as "Blue / AU 4", not "Blue". Ten sizes of one blue shirt therefore
         look like ten distinct colours that all resolve to the same hex, and
         the card shows ten identical blue dots.

         So split both fields and classify the tokens rather than trusting the
         field name. Fixing this at source is item 1 of feed-fixes.md. */
      [v.color, v.size].forEach(function (field) {
        String(field == null ? '' : field).split('/').forEach(function (raw) {
          var tok = raw.trim();
          if (!tok) return;
          var hex = swatchHex(tok);
          if (hex) {
            if (!seenSw[tok]) { seenSw[tok] = 1; sw.push({ label: tok, hex: hex }); }
          } else {
            if (!seenCh[tok]) { seenCh[tok] = 1; ch.push(tok); }
          }
        });
      });
    });
    return { swatches: sw, chips: ch };
  }

  /* Returns { swatches: [{label,hex}], chips: [label] } for a product's group.
     Whichever list is longer wins in the card; both are capped by the caller. */
  function variantFacets(p) {
    // Eureka's data wins when present — see facetsFromEureka().
    if (p && p._variantData && p._variantData.length > 1) {
      var f = facetsFromEureka(p._variantData);
      if (f.swatches.length > 1 || f.chips.length > 1) return f;
    }
    var vs = variantsOf(p);
    if (vs.length < 2) return { swatches: [], chips: [] };

    var sw = [], ch = [], seenSw = {}, seenCh = {};
    vs.forEach(function (v) {
      String(v.variant_label || v.color || v.size || '').split('/').forEach(function (raw) {
        var tok = raw.trim();
        if (!tok) return;
        var hex = swatchHex(tok);
        if (hex) {
          if (!seenSw[tok]) { seenSw[tok] = 1; sw.push({ label: tok, hex: hex }); }
        } else {
          if (!seenCh[tok]) { seenCh[tok] = 1; ch.push(tok); }
        }
      });
    });
    return { swatches: sw, chips: ch };
  }

  function byCollection(name, subcategory) {
    return oneVariantEach(catalog.filter(function (p) {
      if (p.collection !== name) return false;
      if (subcategory && p.subcategory !== subcategory) return false;
      return true;
    }));
  }

  function collections() { return Object.keys(window.COLLECTIONS || {}); }
  function subcategories(name) { return (window.COLLECTIONS || {})[name] || []; }

  function localSearch(q) {
    var t = String(q || '').trim().toLowerCase();
    if (!t) return [];
    var words = t.split(/\s+/);
    var hits = catalog.filter(function (p) {
      var hay = (p.name + ' ' + (p.variant_label || '') + ' ' + p.subcategory + ' ' +
                 p.product_type + ' ' + p.collection + ' ' +
                 (p.tags || []).join(' ')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) > -1; });
    });
    return oneVariantEach(hits).slice(0, 48);
  }

  /* Collapse a list to one card per product.

     Every record is a VARIANT, so a route with four cabins, or a room with
     six rates, is four or six records sharing a groupcode and an image. Shown
     raw they read as duplicates — four identical "London to New York" cards
     differing only by a price.

     So: one card per groupcode, showing the CHEAPEST variant, annotated with
     how many there are. card() turns that into "from EUR 340 - 4 options".
     Picking the cheapest rather than the first also makes the from-price
     honest, which the first-variant version was only by luck.

     Records with no groupcode pass through untouched. */
  function oneVariantEach(list) {
    var groups = {}, order = [];
    list.forEach(function (p) {
      var key = p.groupcode || ('_' + p.id);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(p);
    });
    return order.map(function (key) {
      var vs = groups[key];
      var best = vs[0];
      for (var i = 1; i < vs.length; i++) {
        if (price(vs[i]) < price(best)) best = vs[i];
      }
      if (vs.length < 2) return best;
      // Copy, so annotations never leak back into the catalog itself.
      var out = Object.assign({}, best);
      out._variants = vs.length;
      return out;
    });
    function price(p) {
      var n = Number(p.unit_sale_price);
      return isFinite(n) && n > 0 ? n : Number(p.unit_price) || Infinity;
    }
  }

  function featured(n) {
    var out = [], names = collections(), round = 0, seen = {};
    while (out.length < n && round < 200) {
      for (var i = 0; i < names.length && out.length < n; i++) {
        var pool = oneVariantEach(byCollection(names[i]));
        var pick = pool[(round * 5 + i * 3) % pool.length];
        if (pick && !seen[pick.groupcode]) { seen[pick.groupcode] = true; out.push(pick); }
      }
      round++;
    }
    return out;
  }

  function onSale() {
    return oneVariantEach(catalog.filter(function (p) {
      return p.unit_sale_price < p.unit_price;
    }));
  }

  /* --- urls / money ------------------------------------------------------- */
  function localHref(p) {
    // vertical.js appends ?v= on non-subdomain hosts; on a subdomain the
    // hostname already identifies the store, so the link stays clean.
    return 'product.html?id=' + encodeURIComponent(p.id);
  }

  function env(key, fallback) {
    return (window.ENVIRONMENT && window.ENVIRONMENT[key]) || fallback;
  }

  function money(n) {
    // Currency is per-environment because it must match the catalog the feed
    // was loaded into, and it is visible on every card, cart and order.
    return new Intl.NumberFormat(env('locale', 'en_GB').replace('_', '-'), {
      style: 'currency', currency: env('currency', 'EUR'), minimumFractionDigits: 2
    }).format(Number(n) || 0);
  }

  /* --- the Insider product payload ---------------------------------------- */
  /* Turn a catalogue image path into something that resolves anywhere. Left
     alone if it is already absolute, so a rehosted or CDN-hosted image passes
     through untouched. */
  function absoluteImage(img) {
    if (!img) return undefined;
    if (img.indexOf('http') === 0 || img.indexOf('//') === 0) return img;
    return location.origin + '/' + String(img).replace(/^\//, '');
  }

  function productPayload(p, quantity) {
    if (!p) return null;
    var payload = {
      id: p.id,
      name: p.name,
      taxonomy: p.taxonomy,
      currency: env('currency', 'EUR'),
      unit_price: p.unit_price,
      unit_sale_price: p.unit_sale_price,
      url: p.url,

      /* ABSOLUTE, ALWAYS. The catalogue stores image paths relative to the
         site root, which is right for a page — the browser resolves them
         against the current URL.

         Nothing outside the browser can do that. An email, a web push and an
         app push all render this value with no page to resolve against, so a
         relative path is a broken image in every message the platform sends.
         And because last_visited_product_img is derived from THIS field, the
         breakage is stored on the profile rather than introduced later, which
         means fixing it in a template would fix one message and leave the
         rest wrong.

         The feed already carries absolute URLs; this is the page-view payload,
         which did not. */
      product_image_url: absoluteImage(p.image),
      stock: p.stock,
      in_stock: p.in_stock,
      groupcode: p.groupcode,
      sku: p.sku,
      locale: env('locale', 'en_GB'),
      custom: {
        vendor: p.vendor,
        product_type: p.product_type,
        handle: p.handle,
        product_id: p.groupcode,
        tags: p.tags || []
      }
    };
    if (p.size) payload.size = p.size;
    if (p.color) payload.color = p.color;
    if (quantity != null) payload.quantity = quantity;
    return payload;
  }

  /* --- cart --------------------------------------------------------------- */
  function rawCart() { return read(KEY.cart, []); }

  function cartLines() {
    return rawCart().map(function (line) {
      var p = byId(line.id);
      return p ? productPayload(p, line.qty) : null;
    }).filter(Boolean);
  }

  function cartTotal() {
    return round2(cartLines().reduce(function (s, l) {
      return s + l.unit_sale_price * l.quantity;
    }, 0));
  }
  function cartCount() { return rawCart().reduce(function (n, l) { return n + l.qty; }, 0); }
  function round2(n) { return Math.round(n * 100) / 100; }

  function addToCart(id, qty) {
    var lines = rawCart();
    var match = lines.filter(function (l) { return l.id === String(id); })[0];
    if (match) match.qty += (qty || 1);
    else lines.push({ id: String(id), qty: qty || 1 });
    write(KEY.cart, lines);
    paintChrome();
    return productPayload(byId(id), qty || 1);
  }

  function removeFromCart(id) {
    var lines = rawCart();
    var match = lines.filter(function (l) { return l.id === String(id); })[0];
    write(KEY.cart, lines.filter(function (l) { return l.id !== String(id); }));
    paintChrome();
    return match ? productPayload(byId(id), match.qty) : null;
  }

  function setQty(id, qty) {
    if (qty < 1) return removeFromCart(id);
    var lines = rawCart();
    lines.forEach(function (l) { if (l.id === String(id)) l.qty = qty; });
    write(KEY.cart, lines);
    paintChrome();
    return null;
  }

  function clearCart() { write(KEY.cart, []); paintChrome(); }

  /* --- sign-in ------------------------------------------------------------ */
  function currentUser() { return read(KEY.user, null); }

  /* --- identity: the uuid is the customer number ----------------------------
     Before sign-in the visitor is the browser's random id. At sign-in the
     uuid becomes a STABLE id derived from the email — the same person is the
     same uuid on every browser and every machine, by construction. That is
     what a real site does (the uuid is the customer number), and on this
     platform it is what makes a second browser resolve to the same profile:
     identity resolution here is uuid-first with a limit of one uuid per
     profile, so a known email arriving on a *new* random uuid becomes a
     second profile with the email refused. Sending the same uuid everywhere
     means there is never a second profile to merge.

     Insider's own storage is cleared when the uuid changes so the tag
     re-initialises as the new identity rather than carrying the old spUID.
     Log out goes the other way: a fresh random visitor, so the next person
     on this browser does not inherit the account. */
  function clearInsiderIdentity() {
    try {
      Object.keys(localStorage).filter(function (k) { return k.indexOf('ins-') === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
      Object.keys(sessionStorage).filter(function (k) { return k.indexOf('ins-') === 0; })
        .forEach(function (k) { sessionStorage.removeItem(k); });
      /* The tag sets its cookies on the parent domain (.insiderdemo.com), so
         every storefront shares them: a session started on Ashford Lane is
         the session Meridian Air renders with. Expire each ins-* cookie on
         the hostname AND on every parent domain, or the wipe does nothing. */
      var host = location.hostname, parts = host.split('.'), domains = [''];
      for (var i = 0; i < parts.length - 1; i++) {
        var d = parts.slice(i).join('.');
        domains.push(d); domains.push('.' + d);
      }
      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (n.indexOf('ins-') !== 0 && n.indexOf('spUID') !== 0) return;
        domains.forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      });
    } catch (e) {}
  }

  /* --- re-identify from the profile --------------------------------------
     The tag fetches the profile's attribute values once, when its session
     starts, and renders every campaign from that copy until the session
     ends. An attribute written mid-session (trip_status after "Mark this
     flight as delayed", loyalty after a booking) lands on the profile but
     the page keeps rendering the old snapshot. refreshIdentity() ends the
     tag's session and loads `next` twice: the first load re-identifies the
     browser (user push with the uuid), the second renders with the values
     fetched for that identity. Callers give the write a moment to land
     before calling this. The #reid marker drives the second load. */
  /* A profile write that a campaign reads marks a refresh as owed. The
     writing page normally pays it a few seconds later; if the visitor leaves
     first, the next page loads, sees the debt, and pays it instead. Cleared
     only when the two-load refresh has completed. */
  var OWED = 'lmn.reid_owed';
  function oweRefresh() { try { localStorage.setItem(OWED, '1'); } catch (e) {} }
  function refreshIdentity(next) {
    oweRefresh();
    clearInsiderIdentity();
    var target = next || location.pathname;
    var here = location.pathname.split('/').pop() || 'index.html';
    var there = target.split('/').pop() || 'index.html';
    // A hash-only change does not reload the page; same page needs reload().
    if (here === there || (here === '' && there === 'index.html')) {
      location.hash = 'reid';
      location.reload();
    } else {
      location.href = target + '#reid';
    }
  }
  /* Second load: hold the page under a small veil while the tag
     re-identifies, then load once more so campaigns render from the fresh
     profile. Six seconds is long enough for the user push to be processed;
     two and a half was not always. */
  (function () {
    if (location.hash !== '#reid') {
      // Debt from a page that was left early: pay it now.
      try {
        if (localStorage.getItem(OWED) === '1') { setTimeout(function () { refreshIdentity(location.pathname); }, 300); }
      } catch (e) {}
      return;
    }
    try { localStorage.removeItem(OWED); } catch (e) {}
    document.addEventListener('DOMContentLoaded', function () {
      var v = document.createElement('div');
      v.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.85);z-index:99999;display:flex;align-items:center;justify-content:center;font:500 1rem/1.4 system-ui,sans-serif;color:#333';
      v.textContent = 'Updating your profile\u2026';
      document.body.appendChild(v);
    });
    setTimeout(function () {
      location.replace(location.pathname + location.search);
    }, 6000);
  })();
  function stableId(email) { return 'LMN-' + hash(String(email || '').trim().toLowerCase()); }

  function signIn(profile) {
    var merged = Object.assign({}, currentUser() || {}, profile);
    /* The uuid is the browser's visitor id, for life. It is never replaced
       by an email-derived one: the platform keeps one uuid per profile, and
       switching at sign-in split every new booking onto a second record.
       Only a saved visitor (signInAs) or New visitor changes the id. */
    if (!merged.uuid) merged.uuid = visitorId();
    if (!merged.signup_date) merged.signup_date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    write(KEY.user, merged);
    /* Switching to a known uuid does NOT wipe the tag's storage: the next
       user push carries the uuid and the platform moves this browser's
       session onto that profile (identity resolution by uuid). Wiping here
       gave the tag a fresh anonymous session whose campaign values were
       fetched before it had re-identified — the banner vanished on the
       first page. Only Log out and New visitor wipe. */
    if (visitorId() !== merged.uuid) writeVisitorCookie(merged.uuid);
    paintChrome();
    return merged;
  }

  function signOut() {
    localStorage.removeItem(KEY.user);
    clearVisitorCookie();   // next visitor gets a fresh id
    clearInsiderIdentity();
    paintChrome();
  }

  /* --- the platform's own popup signs the visitor in here too -------------
     The lead-collection popup writes the email to the profile — that is the
     "become known" beat. But the site did not know it had happened, so the
     header still said "Log in" while the platform already knew the person.
     This watches any Insider-rendered form: when it submits with an email,
     the site signs in with the same address (stable uuid, same rules as the
     account page), so both sides agree on who this is. Nothing is sent that
     the popup did not already send. */
  document.addEventListener('submit', function (ev) {
    var form = ev.target;
    if (!form || !form.closest) return;
    var box = form.closest('[class*="ins-"], [id*="ins-"], [data-campaign-id]');
    if (!box) return;
    var input = form.querySelector('input[type="email"], input[name*="mail" i]');
    var email = input && String(input.value || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    if (currentUser() && currentUser().email === email) return;
    signIn({ email: email, email_optin: true, gdpr_optin: true });
    if (window.insDebugNote) window.insDebugNote('popup sign-in · ' + email, 'ok');
  }, true);
  // Some templates submit with a click handler rather than a form submit.
  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-form-submit], [data-element-type="submit"], [id^="ins-submit"], button.ins-btn');
    if (!btn) return;
    // Walk up until an ancestor holds the email field — the button is
    // type="button" and sits beside the input, not around it.
    var node = btn.parentNode, input = null;
    var looks = function (v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(v || '').trim()); };
    while (node && node !== document && !input) {
      if (node.querySelectorAll) {
        var ins = node.querySelectorAll('input');
        for (var i = 0; i < ins.length; i++) { if (looks(ins[i].value)) { input = ins[i]; break; } }
      }
      node = node.parentNode;
    }
    var email = input && String(input.value || '').trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    if (currentUser() && currentUser().email === email) return;
    signIn({ email: email, email_optin: true, gdpr_optin: true });
    if (window.insDebugNote) window.insDebugNote('popup sign-in · ' + email, 'ok');
  }, true);

  /* --- personas -----------------------------------------------------------
     A persona is a known profile on the platform: a uuid the account already
     holds, plus the email and profile fields to sign in with. Signing in as
     one sets THIS browser's visitor id to that uuid before the tag runs, so
     the platform resolves to the existing profile on any machine — no merge,
     no second profile. That matters because identity resolution here is
     uuid-first with a limit of one: a known email on a new uuid creates a
     stranger. The persona hands the platform the uuid it already knows.

     Insider's own storage is cleared too, so its spUID does not keep pointing
     at the previous visitor. The page reloads with the new identity.

     The shared list is personas.json in the repo; personal ones live in
     localStorage under lmn.personas (see account.html). */
  /* Ask the site's own function whether the platform already knows this
     email; if so, adopt that profile's uuid before signing in. Resolves to
     false when the lookup is unavailable, and sign-in then uses the stable
     derived id. */
  function adoptKnown(email) {
    /* Disabled: adopting a known profile's uuid for a typed email switched
       the browser's identity mid-session, which is the split we are
       removing. A typed email attaches to THIS profile; to become an
       existing person, pick a saved visitor. */
    return Promise.resolve(false);
    return fetch('/.netlify/functions/whois', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim() })
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (k) {
      if (!k || !k.found || !k.uuid) return false;
      var u0 = currentUser() || {};
      signInAs({ email: k.email, uuid: k.uuid, profile: Object.assign({}, u0, { email: k.email }) });
      return k;
    }).catch(function () { return false; });
  }

  function signInAs(persona) {
    if (!persona || !persona.uuid) return false;
    writeVisitorCookie(persona.uuid);
    localStorage.removeItem(KEY.user);
    /* End the tag's current session: it may already be an anonymous profile
       with its own uuid, and the platform will not attach a second uuid to
       it. A fresh session identifies as the persona from the first push. */
    clearInsiderIdentity();
    // The persona's uuid wins over the derived one: older profiles were
    // created under browser ids, and the persona records the one the
    // platform actually holds.
    var profile = Object.assign({}, persona.profile || {}, { email: persona.email, uuid: persona.uuid });
    var merged = Object.assign({}, profile);
    if (!merged.signup_date) merged.signup_date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    write(KEY.user, merged);
    paintChrome();
    return true;
  }

  function hash(s) {
    var h = 0, str = String(s || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  }

  function userPayload() {
    var u = currentUser();
    // language must match the catalog locale or Eureka returns nothing.
    /* No uuid until someone signs in. An anonymous browser used to push its
       random visitor id as uuid, so the profile got a uuid before the email
       arrived; at sign-in the site switched to the email-derived id, the
       platform could not attach a second uuid, and the attributes went to a
       record the session never rendered. Anonymous profiles are keyed on the
       tag's own id; the first uuid the platform sees is the one to keep. */
    var base = { uuid: visitorId(), language: env('locale', 'en_GB'), gdpr_optin: true };
    /* Which storefront this is, on every profile, signed in or not. Campaign
       rules target `vertical equals beauty` rather than matching hostnames,
       and templates say the shop's name with a token. Read from the vertical
       config, so a new storefront sends the right values with no edit here.
       (Restored 13 Sep — an older copy of this file had shipped without them.) */
    var V = window.VERTICAL || {};
    var where = { vertical: V.key || undefined, brand: V.brand || undefined };
    if (!u) {
      base.custom = Object.assign({
        membership_tier: 'Guest', loyalty_points: 0,
        preferred_category: preferredCategory(), is_vip: false
      }, where);
      return base;
    }
    return Object.assign(base, {
      email: u.email,
      email_optin: !!u.email_optin,
      name: u.name,
      surname: u.surname,
      phone_number: u.phone_number || undefined,
      sms_optin: !!u.sms_optin,
      whatsapp_optin: !!u.whatsapp_optin,
      gender: u.gender || undefined,
      birthday: u.birthday || undefined,
      city: u.city || undefined,
      /* Only when a person actually typed it. Deriving a country from the
         locale meant every visitor was recorded in the UK and the platform's
         own IP-derived geo was overwritten on every page load — which breaks
         Location segments and Weather rules, the two things that most need it
         to be true. */
      country: u.country || undefined,
      gdpr_optin: u.gdpr_optin !== false,
      custom: Object.assign({
        membership_tier: u.membership_tier || 'Bronze',
        loyalty_points: typeof u.loyalty_points === 'number' ? u.loyalty_points : 0,
        preferred_category: u.preferred_category || preferredCategory(),
        signup_date: u.signup_date,
        is_vip: u.membership_tier === 'Gold',
        /* The durable fact the flow page captured — the store for retail and
           hotels, the cover type for insurance, the plan for telco. Which
           field that is per vertical is declared as flow.attribute_field in
           verticals.json; see the note in flow.html.

           Named properly now. It used to be written into `service_preference`,
           an unrelated attribute repurposed when the account looked full. */
        preferred_store: u.preferred_store || undefined,

        /* Replenishment. The array is the record; these two are what a journey
           and an onsite campaign can actually read.

           next_due_date anchors the Dynamic Date starter — it fires a few days
           before, and the message names the product. next_due_product is there
           so an onsite message can say it too, since onsite personalization
           cannot read an Array of Objects. */
        next_due_date: (function () {
          var d = nextDue();
          return d ? new Date(d.due_at).toISOString().replace(/\.\d+Z$/, 'Z') : undefined;
        })(),
        next_due_product: (function () {
          var d = nextDue();
          return d ? d.name : undefined;
        })(),

        /* Anniversary, flattened. See anniversaryPick above for why these are
           four separate attributes rather than a read into the array. */
        anniversary_date: (function () {
          var a = anniversaryPick();
          if (!a) return undefined;
          var months = (window.VERTICAL || {}).anniversary_months || 11;
          var when = a.purchased_at + months * 30 * 86400000;
          return new Date(when).toISOString().replace(/\.\d+Z$/, 'Z');
        })(),
        anniversary_product: (function () {
          var a = anniversaryPick(); return a ? a.name : undefined;
        })(),
        anniversary_image: (function () {
          var a = anniversaryPick(); return a ? a.image : undefined;
        })(),
        anniversary_url: (function () {
          var a = anniversaryPick(); return a ? a.url : undefined;
        })(),
        // The store's own account id. An attribute, not an identifier — the
        // uuid above is what Insider matches on, and it must stay stable.
        account_id: u.uuid || undefined
      }, where, extraAttributes(u))
    });
  }

  /* Vertical-specific profile attributes, declared as profile.extra in
     verticals.json and edited on the account page. Travel: trip_status,
     next_trip, next_trip_date — the disruption beat reads them from an
     onsite campaign. Only set values are sent, so a blank never overwrites
     what the platform holds. */
  function extraAttributes(u) {
    var out = {};
    (((window.VERTICAL || {}).profile || {}).extra || []).forEach(function (f) {
      var val = u[f.name];
      if (val !== undefined && val !== null && val !== '') out[f.name] = val;
    });
    return out;
  }

  function preferredCategory() {
    var views = read('lmn.views', {});
    var best = null, top = 0;
    Object.keys(views).forEach(function (k) { if (views[k] > top) { top = views[k]; best = k; } });
    return best || 'Makeup';
  }
  /* --- purchase history, as an Array of Objects ----------------------------
     One object per line item, appended at checkout. This is the data behind
     replenishment: the platform can anchor a journey on a datetime key inside
     an Array of Objects, and Liquid can loop the array to render the items in
     the message.

     WHY AN ARRAY RATHER THAN FLAT ATTRIBUTES

     `last_purchase_date` is one field per profile. Buy toothpaste and then
     milk and it holds the milk. An aggregate does not help either — it returns
     one value per definition, so "last bought in Skincare" is one aggregate
     per category and does not scale past a handful.

     An array holds every line with its own date, so "when did they last buy
     this" is answerable per product.

     THE DUE DATE IS COMPUTED FROM THEIR OWN BEHAVIOUR WHERE POSSIBLE.

     On the second purchase of the same product we know the interval that
     person actually keeps, which beats any table of shelf lives — a household
     of five gets through shampoo faster than one person, and only their own
     history knows that. The configured interval is the fallback for a first
     purchase, and it is per collection because mascara and fragrance are not
     on the same clock. */
  function replenishmentDays(product) {
    var map = (window.VERTICAL || {}).replenishment_days;
    if (!map) return 0;
    return map[product.collection] || map._default || 0;
  }

  function purchaseHistory() { return read('lmn.purchases', []); }

  /* --- bookings, as an Array of Objects -------------------------------------
     Travel's record. A purchase is a line item; a booking is a trip — route
     or property, when, how long, which cabin or room, what was paid, and the
     ancillaries added. One object per booking on the profile, under the
     `bookings` Array of Objects attribute. The flat trip fields (next_trip,
     next_trip_date, trip_status) are derived from the latest one for onsite
     campaigns to read, since web Liquid cannot reach into an array.
     Ancillaries are a comma-separated string, not a nested array — object
     fields are scalars on the platform. */
  function bookingHistory() { return read('lmn.bookings', []); }
  function noteBooking(order, extra) {
    if (!order || !order.items || !order.items.length) return bookingHistory();
    var hist = bookingHistory();
    var line = order.items[0];
    var p = byId(line.id) || {};
    var when = extra && extra.travel_date ? new Date(extra.travel_date) : new Date(Date.now() + 14 * 86400000);
    hist.push({
      booking_id: order.order_id,
      route: p.name || line.name,
      destination: p.subcategory || '',
      region: p.collection || '',
      cabin: p.variant_label || line.variant || '',
      travel_date: when.toISOString().slice(0, 10) + 'T00:00:00Z',
      nights: extra && extra.nights ? Number(extra.nights) : 0,
      fare: Math.round((Number(order.total) || 0) * 100) / 100,
      booked_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
      status: 'On time',
      ancillaries: (extra && extra.ancillaries) || ''
    });
    write('lmn.bookings', hist.slice(-40));
    return hist;
  }
  /* Array-of-Objects attributes cannot travel in the tag's user object; they
     go through the site's sync function to the Upsert API. Fire-and-forget;
     the console gets a note either way. */
  function syncArray(attribute, items, mode) {
    return fetch('/.netlify/functions/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: visitorId(), attribute: attribute, items: items, mode: mode || 'add' })
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (window.insDebugNote) window.insDebugNote(attribute + ' → Upsert: ' + (out.ok ? 'ok' : 'failed ' + (out.status || out.reason || out.error || '')), out.ok ? 'ok' : 'warn');
      return out;
    }).catch(function (e) {
      if (window.insDebugNote) window.insDebugNote(attribute + ' → Upsert: unreachable', 'warn');
      return { ok: false };
    });
  }

  /* Write flat custom attributes straight to the profile through the same
     function. Used for the writes a campaign reads in the same session
     (trip status, next trip, loyalty), so they land regardless of what the
     tag does with its queue when the session is reset. */
  function syncAttributes(custom) {
    oweRefresh();
    return fetch('/.netlify/functions/sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid: visitorId(), custom: custom || {} })
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (window.insDebugNote) window.insDebugNote('attributes → Upsert: ' + (out.ok ? 'ok' : 'failed ' + (out.status || out.reason || out.error || '')), out.ok ? 'ok' : 'warn');
      return out;
    }).catch(function () {
      if (window.insDebugNote) window.insDebugNote('attributes → Upsert: unreachable', 'warn');
      return { ok: false };
    });
  }

  /* Sync the bookings that have not been sent yet; mark them on success.
     "add" appends on the platform, so sending the same booking twice would
     duplicate it — the synced flag is what stops that. */
  function syncBookings() {
    var hist = bookingHistory();
    var pending = hist.filter(function (b) { return !b.synced; });
    if (!pending.length) return Promise.resolve({ ok: true, skipped: true });
    return syncArray('bookings', bookingsPayload(pending), 'add').then(function (out) {
      if (out && out.ok) {
        hist.forEach(function (b) { if (!b.synced) b.synced = true; });
        write('lmn.bookings', hist);
      }
      return out;
    });
  }

  function bookingsPayload(hist) {
    return (hist || bookingHistory()).map(function (b) {
      return {
        booking_id: String(b.booking_id), route: b.route, destination: b.destination, region: b.region,
        cabin: b.cabin, travel_date: b.travel_date, nights: b.nights || 0, fare: b.fare || 0,
        booked_at: b.booked_at, status: b.status || 'On time', ancillaries: b.ancillaries || ''
      };
    });
  }

  function notePurchase(items) {
    if (!items || !items.length) return purchaseHistory();
    var hist = purchaseHistory();
    var now = Date.now();

    items.forEach(function (line) {
      var p = line.product || line;
      if (!p || !p.id) return;

      /* Record the purchase EVERYWHERE. Two different journeys read this and
         they need different things:

         REPLENISHMENT needs an interval — buy it again in about six weeks.
         Only some verticals have one: beauty, supermarket, anything
         consumable.

         ANNIVERSARY needs only the date. "You bought a swimsuit last May, and
         it is May again" works on fashion, luxury, hotels and airlines, none
         of which have a replenishment cycle at all. Insurance renewal is the
         same shape on a twelve-month clock.

         So an absent interval means no due date, not no record. */
      var days = replenishmentDays(p);

      /* Their own interval, if we have seen this product before. Averaged over
         everything we have, so one holiday-driven early rebuy cannot skew it. */
      var previous = hist.filter(function (h) { return h.groupcode === p.groupcode; })
                         .map(function (h) { return h.purchased_at; })
                         .sort();
      if (previous.length) {
        var gaps = [];
        var all = previous.concat([now]);
        for (var i = 1; i < all.length; i++) {
          gaps.push((all[i] - all[i - 1]) / 86400000);
        }
        var mean = gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length;
        if (mean > 3 && mean < 400) days = Math.round(mean);
      }

      var entry = {
        product_id: String(p.id),
        groupcode: p.groupcode || String(p.id),
        name: p.name,
        image: absoluteImage(p.image),
        url: p.url || localHref(p),
        category: p.collection,
        purchased_at: now
      };
      if (days) {
        entry.due_at = now + days * 86400000;
        entry.interval_days = days;
        entry.learned = previous.length > 0;
      }
      hist.push(entry);
    });

    /* Keep it bounded. Arrays of Objects have a size limit and two years of
       weekly grocery shopping would breach it; the recent history is what the
       intervals are computed from anyway. */
    hist = hist.slice(-60);
    write('lmn.purchases', hist);
    return hist;
  }

  /* The soonest thing due, as flat values. The array anchors the journey and
     renders the message, but onsite personalization reads default and custom
     attributes only — so anything the site or an onsite campaign needs has to
     be flat as well. */
  function nextDue() {
    var hist = purchaseHistory();
    if (!hist.length) return null;
    var seen = {}, best = null;
    // Latest purchase per product wins; an older line is already superseded.
    hist.forEach(function (h) {
      var cur = seen[h.groupcode];
      if (!cur || h.purchased_at > cur.purchased_at) seen[h.groupcode] = h;
    });
    Object.keys(seen).forEach(function (g) {
      if (!seen[g].due_at) return;             // anniversary-only, nothing due
      if (!best || seen[g].due_at < best.due_at) best = seen[g];
    });
    return best;
  }

  /* --- the anniversary pick ------------------------------------------------
     Flattened deliberately.

     The purchases array is the right data structure and it stays in the
     browser. What the platform gets is four ordinary attributes, because the
     legacy insider_object path does not carry an Array of Objects — the SDK
     drops shapes it does not recognise, client-side, before anything is sent.
     Web SDK ingestion would carry it; that is switched off on this account.

     So: array here, four flat fields there. A journey can anchor on the date
     and an email can name and picture the product, which is everything the
     anniversary beat needs. When inioa is enabled the array becomes the source
     and these four can go.

     WHICH PURCHASE. The oldest one whose anniversary has not yet passed —
     that is the next occasion coming round, which is what the journey should
     fire on. Falls back to the oldest purchase outright so a profile whose
     anniversaries have all gone by still has something to show. */
  function anniversaryPick() {
    var months = (window.VERTICAL || {}).anniversary_months;
    if (!months) return null;
    var hist = purchaseHistory();
    if (!hist.length) return null;

    var now = Date.now();
    var lead = months * 30 * 86400000;
    var upcoming = hist.filter(function (h) {
      return (h.purchased_at + lead) > now;
    });
    var pool = upcoming.length ? upcoming : hist;

    return pool.slice().sort(function (a, b) {
      return a.purchased_at - b.purchased_at;
    })[0];
  }

  /* --- session counters ----------------------------------------------------
     The site counts what the site does. A campaign rule then only reads.

     This used to live inside the custom rule itself, which was wrong twice
     over: a rule that writes state is keeping a diary rather than answering a
     question, and it only counted pages where a campaign happened to be
     evaluated rather than pages actually viewed.

     Session-scoped on purpose. Intent is a property of this visit — someone
     who browsed heavily last week and arrived cold today is a different person
     to talk to, which is the same reasoning behind the platform's own
     in-session model.

     Everything is wrapped: under a consent framework or a cookie-free tag,
     storage can be unavailable, and a browsing counter must never be the thing
     that breaks a page. */
  var SES = { views: 'lmn.s.views', start: 'lmn.s.start' };

  function sread(k, d) {
    try { var v = sessionStorage.getItem(k); return v == null ? d : v; }
    catch (e) { return d; }
  }
  function swrite(k, v) {
    try { sessionStorage.setItem(k, String(v)); } catch (e) {}
  }

  function noteProductView() {
    swrite(SES.views, (parseInt(sread(SES.views, '0'), 10) || 0) + 1);
  }

  /* Stamped once per session, on the first page of any kind. */
  function startSession() {
    if (!sread(SES.start, null)) swrite(SES.start, Date.now());
    // Visits are lifetime rather than per-session, so they live in localStorage
    // and only increment when a new session begins.
    if (!sread('lmn.s.counted', null)) {
      swrite('lmn.s.counted', 1);
      try {
        var n = parseInt(localStorage.getItem('lmn.visits') || '0', 10) || 0;
        localStorage.setItem('lmn.visits', String(n + 1));
      } catch (e) {}
    }
  }

  function sessionStats() {
    var start = parseInt(sread(SES.start, '0'), 10) || 0;
    var visits = 0;
    try { visits = parseInt(localStorage.getItem('lmn.visits') || '0', 10) || 0; } catch (e) {}
    return {
      productViews: parseInt(sread(SES.views, '0'), 10) || 0,
      seconds: start ? Math.round((Date.now() - start) / 1000) : 0,
      visits: visits,
      cartCount: (read(KEY.cart, []) || []).length,
      hasPurchased: !!(currentUser() && currentUser().last_purchase_date)
    };
  }

  function noteCategoryView(c) {
    if (!c) return;
    var views = read('lmn.views', {});
    views[c] = (views[c] || 0) + 1;
    write('lmn.views', views);
  }

  /* --- wishlist ----------------------------------------------------------- */
  function toggleWish(id) {
    var list = read(KEY.wish, []);
    var i = list.indexOf(String(id));
    if (i > -1) list.splice(i, 1); else list.push(String(id));
    write(KEY.wish, list);
    return list.indexOf(String(id)) > -1;
  }
  function isWished(id) { return read(KEY.wish, []).indexOf(String(id)) > -1; }

  /* The saved items as full catalogue records, for insider_object.wishlist.
     Ids that no longer resolve are dropped rather than sent as holes. */
  function wishlist() {
    return read(KEY.wish, [])
      .map(function (id) { return byId(String(id)); })
      .filter(Boolean);
  }

  /* --- shared chrome ------------------------------------------------------ */
  function paintChrome() {
    startSession();
    var count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(function (n) {
      n.textContent = count;
      n.hidden = count === 0;
    });
    var u = currentUser();
    /* --- the signed-in strip -----------------------------------------------
       Tier, points and home store in the masthead once someone is known.

       This is the payoff for act three made visible on every page rather than
       only on the profile in the panel: the visitor gave one thing, and the
       site now greets them with it everywhere. It is also the natural home for
       a loyalty lookup — the profile holds which tier and which store, and a
       lookup table holds what that tier is worth and where that store is.

       Hidden entirely when signed out, so it never shows an empty shell. */
    document.querySelectorAll('[data-loyalty-strip]').forEach(function (host) {
      var u = currentUser();
      if (!u) { host.hidden = true; host.innerHTML = ''; return; }
      var bits = [];
      if (u.membership_tier) bits.push(u.membership_tier);
      if (typeof u.loyalty_points === 'number') {
        bits.push(u.loyalty_points.toLocaleString() + ' pts');
      }
      if (u.preferred_store) bits.push(u.preferred_store);
      if (!bits.length) { host.hidden = true; host.innerHTML = ''; return; }
      host.innerHTML = bits.map(function (b, i) {
        return '<span' + (i === 0 ? ' class="loy__tier"' : '') + '>' + b + '</span>';
      }).join('<span class="loy__sep">·</span>');
      host.hidden = false;
    });

    document.querySelectorAll('[data-account-label]').forEach(function (n) {
      n.textContent = u ? (u.name || 'Account') : 'Log in';
    });
  }

  function wireSearchBox() {
    document.querySelectorAll('form[data-search]').forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var input = form.querySelector('input');
        var q = input.value.trim();
        if (q) location.href = 'search.html?q=' + encodeURIComponent(q);
      });
    });
  }

  function shortName(c) { return c; }

  function buildNav() {
    document.querySelectorAll('[data-collection-nav]').forEach(function (host) {
      var current = host.getAttribute('data-current');
      host.innerHTML = '';

      /* "Just for you" leads the nav, because it is the only entry that is
         about the visitor rather than about the catalogue. Its wording comes
         from the vertical — "Your usuals" on a supermarket, "Where to next"
         on an airline — so it reads as that brand's own language rather than
         as a platform feature bolted on.

         data-current="__foryou__" marks it on the page itself.

         SC demo only: the page is left out of the sandbox nav, since it
         invites a closer look than a browser-derived ranking survives. */
      var fy = (window.VERTICAL || {}).foryou_title;
      if (fy && window.ENVIRONMENT_KEY !== 'sandbox') {
        var f = document.createElement('a');
        f.href = 'foryou.html';
        f.textContent = fy;
        if (current === '__foryou__') f.setAttribute('aria-current', 'page');
        host.appendChild(f);
      }

      collections().forEach(function (c) {
        var a = document.createElement('a');
        a.href = 'category.html?c=' + encodeURIComponent(c);
        a.textContent = shortName(c);
        if (current === c) a.setAttribute('aria-current', 'page');
        host.appendChild(a);
      });
    });
  }

  /* --- product card ------------------------------------------------------- */
  function card(p, opts) {
    opts = opts || {};
    var el = document.createElement('article');
    el.className = 'card';
    var sale = p.unit_sale_price < p.unit_price;

    el.innerHTML =
      /* Always a relative link. The catalogue's `url` is the canonical
         product URL on the bare domain — right for the feed and the SDK's
         product object, wrong for navigation: from a -sandbox storefront it
         would carry the visitor to the salesdemo site mid-demo. */
      '<a class="card__link" href="' + (opts.href || localHref(p)) + '">' +
        '<div class="card__media">' +
          (sale ? '<span class="badge">Sale</span>' : '') +
          '<img loading="lazy" alt="" src="' + (p.image || '') + '">' +
        '</div>' +
        '<div class="card__meta">' +
          '<p class="card__vendor"></p>' +
          '<h3 class="card__name"></h3>' +
          '<p class="card__price"></p>' +
        '</div>' +
      '</a>';

    // "All" is a filler leaf in the category path (Fashion > Dresses > All) and
    // reads as noise on every card. Fall back to the level above it.
    var vendorText = p.subcategory || '';
    if (!vendorText || /^all$/i.test(vendorText)) vendorText = p.collection || '';
    if (/^all$/i.test(vendorText)) vendorText = '';
    el.querySelector('.card__vendor').textContent = vendorText;
    el.querySelector('.card__name').textContent = p.name;

    /* What a collapsed group shows under the name, in priority order:
         1. colour swatches, where the tokens are recognisably colours
         2. text chips, where they are sizes, cabins, room types, tiers
         3. "4 options", where there is nothing readable to show
       No per-vertical switch — see variantFacets(). Fashion and telco land on
       swatches, hotels and airlines on chips, because of what their data is. */
    var meta = el.querySelector('.card__meta');
    var priceNode = el.querySelector('.card__price');

    /* Ask the CATALOG how many variants this product has, not the list this
       card came from. Eureka often returns a single row per product, so
       `_variants` (set during collapse) is 1 even for a dress that comes in
       ten sizes — which showed a lone "S" under the name as though that were
       the only one. The catalog knows better. */
    var group = variantsOf(p);
    var variantCount = Math.max(group.length, p._variants || 1);
    var facets = variantCount > 1 ? variantFacets(p) : { swatches: [], chips: [] };
    var MAX_SW = 6, MAX_CH = 4;

    /* Colourways first, where they exist: on a fashion card a colour swatch
       should take you to that colour's product, not filter within this one.
       Each dot is a link to a sibling groupcode, with the current one ringed.
       Rendered as spans rather than anchors because the whole card is already
       wrapped in one and nested anchors are invalid. */
    var ways = colourways(p);
    if (ways.length > 1) {
      var wrow = document.createElement('div');
      wrow.className = 'card__swatches';
      ways.slice(0, MAX_SW).forEach(function (w) {
        var dot = document.createElement('span');
        dot.className = 'swatch swatch--link' +
                        (w.groupcode === p.groupcode ? ' is-current' : '');
        dot.style.background = w.hex;
        dot.title = w.colour;
        dot.setAttribute('role', 'link');
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-label', w.colour);
        dot.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();          // do not follow the card's own link
          location.href = w.href;
        });
        dot.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); location.href = w.href; }
        });
        wrow.appendChild(dot);
      });
      if (ways.length > MAX_SW) {
        var wmore = document.createElement('span');
        wmore.className = 'card__more';
        wmore.textContent = '+' + (ways.length - MAX_SW);
        wrow.appendChild(wmore);
      }
      meta.insertBefore(wrow, priceNode);

    } else if (facets.swatches.length > 1) {
      var row = document.createElement('div');
      row.className = 'card__swatches';
      facets.swatches.slice(0, MAX_SW).forEach(function (sw) {
        var dot = document.createElement('span');
        dot.className = 'swatch';
        dot.style.background = sw.hex;
        dot.title = sw.label;              // hover shows the real name
        dot.setAttribute('aria-label', sw.label);
        row.appendChild(dot);
      });
      if (facets.swatches.length > MAX_SW) {
        var more = document.createElement('span');
        more.className = 'card__more';
        more.textContent = '+' + (facets.swatches.length - MAX_SW);
        row.appendChild(more);
      }
      meta.insertBefore(row, priceNode);

    } else if (facets.chips.length > 1) {
      var crow = document.createElement('div');
      crow.className = 'card__chips';
      facets.chips.slice(0, MAX_CH).forEach(function (label) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = label;
        crow.appendChild(chip);
      });
      if (facets.chips.length > MAX_CH) {
        var cmore = document.createElement('span');
        cmore.className = 'card__more';
        cmore.textContent = '+' + (facets.chips.length - MAX_CH);
        crow.appendChild(cmore);
      }
      meta.insertBefore(crow, priceNode);

    } else {
      // Verticals can name their variants: labels.variants = "cabins".
      var variantText = null;
      if (variantCount > 1) {
        var lbl = ((window.VERTICAL || {}).labels || {}).variants || 'options';
        variantText = variantCount + ' ' + lbl;
      } else if (p.variant_label) {
        variantText = p.variant_label;
      }
      if (variantText) {
        var v = document.createElement('p');
        v.className = 'card__variant';
        v.textContent = variantText;
        meta.insertBefore(v, priceNode);
      }
    }

    /* A "from" price has to be the cheapest in the GROUP. When the card came
       straight from Eureka rather than through collapse, p is whichever
       variant matched, not the cheapest — so recompute against the catalog or
       the price on the card contradicts the word "from". */
    var priceEl = el.querySelector('.card__price');
    var from = '';
    var showUnit = p.unit_price, showSale = p.unit_sale_price;
    if (variantCount > 1 && p._variantData && p._variantData.length > 1) {
      // Cheapest across Eureka's own variants.
      var lo = Infinity, loOrig = null;
      p._variantData.forEach(function (v) {
        var n = Number(v.price);
        if (isFinite(n) && n > 0 && n < lo) { lo = n; loOrig = Number(v.original_price) || n; }
      });
      if (isFinite(lo)) {
        from = 'from ';
        showSale = lo;
        showUnit = loOrig && loOrig > lo ? loOrig : lo;
        sale = showSale < showUnit;
      } else {
        from = 'from ';
      }
    } else if (variantCount > 1 && group.length > 1) {
      var cheapest = group[0];
      for (var gi = 1; gi < group.length; gi++) {
        if (groupPrice(group[gi]) < groupPrice(cheapest)) cheapest = group[gi];
      }
      from = 'from ';
      showUnit = cheapest.unit_price;
      showSale = cheapest.unit_sale_price;
      sale = showSale < showUnit;
    } else if (variantCount > 1) {
      from = 'from ';
    }

    if (sale) {
      priceEl.innerHTML = '<s class="was"></s> <span class="now"></span>';
      priceEl.querySelector('.was').textContent = money(showUnit);
      priceEl.querySelector('.now').textContent = from + money(showSale);
    } else {
      priceEl.textContent = from + money(showUnit);
    }

    function groupPrice(x) {
      var n = Number(x.unit_sale_price);
      return isFinite(n) && n > 0 ? n : Number(x.unit_price) || Infinity;
    }

    if (opts.onClick) el.querySelector('.card__link').addEventListener('click', opts.onClick);
    return el;
  }

  function grid(target, products, opts) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return;
    node.innerHTML = '';
    products.forEach(function (p, i) { node.appendChild(card(p, Object.assign({ index: i }, opts))); });
  }

  window.Store = {
    currency: function () { return env('currency', 'EUR'); },
    locale: function () { return env('locale', 'en_GB'); },
    catalog: catalog, oneVariantEach: oneVariantEach, byId: byId, byCollection: byCollection,
    collections: collections, subcategories: subcategories, shortName: shortName,
    localSearch: localSearch, featured: featured, onSale: onSale,
    visitorId: visitorId, resetVisitor: resetVisitor, signInAs: signInAs, adoptKnown: adoptKnown,
    localHref: localHref, money: money, productPayload: productPayload,
    cartLines: cartLines, cartTotal: cartTotal, cartCount: cartCount,
    addToCart: addToCart, removeFromCart: removeFromCart, setQty: setQty, clearCart: clearCart,
    bookingHistory: bookingHistory, noteBooking: noteBooking, bookingsPayload: bookingsPayload, syncArray: syncArray, syncBookings: syncBookings,
    currentUser: currentUser, signIn: signIn, signOut: signOut, refreshIdentity: refreshIdentity, syncAttributes: syncAttributes, userPayload: userPayload,
    noteCategoryView: noteCategoryView, preferredCategory: preferredCategory,
    noteProductView: noteProductView, sessionStats: sessionStats,
    notePurchase: notePurchase, purchaseHistory: purchaseHistory, nextDue: nextDue,
    anniversaryPick: anniversaryPick,
    toggleWish: toggleWish, isWished: isWished, wishlist: wishlist,
    card: card, grid: grid, paintChrome: paintChrome,
    variantsOf: variantsOf, variantFacets: variantFacets, swatchHex: swatchHex,
    colourways: colourways
  };

  document.addEventListener('DOMContentLoaded', function () {
    paintChrome();
    wireSearchBox();
    buildNav();
  });
})();
