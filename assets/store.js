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
  function visitorId() {
    var id = read(KEY.visitor, null);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : 'anon-' + Math.random().toString(36).slice(2) + Date.now());
      write(KEY.visitor, id);
    }
    return id;
  }

  function resetVisitor() {
    [KEY.visitor, KEY.user, KEY.cart, KEY.wish, 'lmn.views', 'lmn.order'].forEach(function (k) {
      localStorage.removeItem(k);
    });
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
      product_image_url: p.image,
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

  function signIn(profile) {
    var merged = Object.assign({}, currentUser() || {}, profile);
    if (!merged.uuid) merged.uuid = 'LMN-' + hash(merged.email);
    if (!merged.signup_date) merged.signup_date = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    write(KEY.user, merged);
    paintChrome();
    return merged;
  }

  function signOut() { localStorage.removeItem(KEY.user); paintChrome(); }

  function hash(s) {
    var h = 0, str = String(s || '');
    for (var i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  }

  function userPayload() {
    var u = currentUser();
    // language must match the catalog locale or Eureka returns nothing.
    var base = { uuid: visitorId(), language: env('locale', 'en_GB'),
                 country: env('locale', 'en_GB').split('_')[1] || 'GB',
                 gdpr_optin: true };
    if (!u) {
      base.custom = {
        membership_tier: 'Guest', loyalty_points: 0,
        preferred_category: preferredCategory(), is_vip: false
      };
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
      country: u.country || env('locale', 'en_GB').split('_')[1] || 'GB',
      gdpr_optin: u.gdpr_optin !== false,
      custom: {
        membership_tier: u.membership_tier || 'Bronze',
        loyalty_points: typeof u.loyalty_points === 'number' ? u.loyalty_points : 0,
        preferred_category: u.preferred_category || preferredCategory(),
        signup_date: u.signup_date,
        is_vip: u.membership_tier === 'Gold',
        // The store's own account id. An attribute, not an identifier — the
        // uuid above is what Insider matches on, and it must stay stable.
        account_id: u.uuid || undefined
      }
    });
  }

  function preferredCategory() {
    var views = read('lmn.views', {});
    var best = null, top = 0;
    Object.keys(views).forEach(function (k) { if (views[k] > top) { top = views[k]; best = k; } });
    return best || 'Makeup';
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

  /* --- shared chrome ------------------------------------------------------ */
  function paintChrome() {
    var count = cartCount();
    document.querySelectorAll('[data-cart-count]').forEach(function (n) {
      n.textContent = count;
      n.hidden = count === 0;
    });
    var u = currentUser();
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
      '<a class="card__link" href="' + (opts.href || p.url || localHref(p)) + '">' +
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
    visitorId: visitorId, resetVisitor: resetVisitor,
    localHref: localHref, money: money, productPayload: productPayload,
    cartLines: cartLines, cartTotal: cartTotal, cartCount: cartCount,
    addToCart: addToCart, removeFromCart: removeFromCart, setQty: setQty, clearCart: clearCart,
    currentUser: currentUser, signIn: signIn, signOut: signOut, userPayload: userPayload,
    noteCategoryView: noteCategoryView, preferredCategory: preferredCategory,
    toggleWish: toggleWish, isWished: isWished,
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
