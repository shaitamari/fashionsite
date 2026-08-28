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

  /* --- visitor identity --------------------------------------------------- */
  function visitorId() {
    var user = currentUser();
    if (user && user.uuid) return user.uuid;
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

  // Spread across collections so the homepage reads as curated rather than
  // showing forty sneakers in a row.
  function oneVariantEach(list) {
    var seen = {}, out = [];
    list.forEach(function (p) {
      if (seen[p.groupcode]) return;
      seen[p.groupcode] = true;
      out.push(p);
    });
    return out;
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

  function money(n) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2
    }).format(Number(n) || 0);
  }

  /* --- the Insider product payload ---------------------------------------- */
  function productPayload(p, quantity) {
    if (!p) return null;
    var payload = {
      id: p.id,
      name: p.name,
      taxonomy: p.taxonomy,
      currency: 'USD',
      unit_price: p.unit_price,
      unit_sale_price: p.unit_sale_price,
      url: p.url,
      product_image_url: p.image,
      stock: p.stock,
      in_stock: p.in_stock,
      groupcode: p.groupcode,
      sku: p.sku,
      locale: 'en_US',
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
    var base = { uuid: visitorId(), language: 'en_US', country: 'US', gdpr_optin: true };
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
      country: u.country || 'US',
      gdpr_optin: u.gdpr_optin !== false,
      custom: {
        membership_tier: u.membership_tier || 'Bronze',
        loyalty_points: typeof u.loyalty_points === 'number' ? u.loyalty_points : 0,
        preferred_category: u.preferred_category || preferredCategory(),
        signup_date: u.signup_date,
        is_vip: u.membership_tier === 'Gold'
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

    el.querySelector('.card__vendor').textContent = p.subcategory || p.collection || '';
    el.querySelector('.card__name').textContent = p.name;
    if (p.variant_label) {
      var v = document.createElement('p');
      v.className = 'card__variant';
      v.textContent = p.variant_label;
      el.querySelector('.card__meta').insertBefore(v, el.querySelector('.card__price'));
    }

    var priceEl = el.querySelector('.card__price');
    if (sale) {
      priceEl.innerHTML = '<s class="was"></s> <span class="now"></span>';
      priceEl.querySelector('.was').textContent = money(p.unit_price);
      priceEl.querySelector('.now').textContent = money(p.unit_sale_price);
    } else {
      priceEl.textContent = money(p.unit_price);
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
    card: card, grid: grid, paintChrome: paintChrome
  };

  document.addEventListener('DOMContentLoaded', function () {
    paintChrome();
    wireSearchBox();
    buildNav();
  });
})();
