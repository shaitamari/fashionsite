/* ============================================================================
   Vertical loader
   ----------------------------------------------------------------------------
   One deploy serves every subvertical. In production the vertical comes from
   the SUBDOMAIN, which gives each store its own hostname:

       https://beauty.insiderdemo.com      Lumen
       https://lifestyle.insiderdemo.com   Posh Street

   That matters for campaign targeting: a rule scoped to a hostname cannot
   collide with another vertical, whereas a shared domain would need every
   rule to also match a query parameter.

   ?v= still works, for localhost and Netlify deploy previews where there is
   no subdomain to read.

   This file must run BEFORE store.js and before any Insider push, because the
   page-type pushes in each <head> read from Store, which reads from CATALOG.

   The catalog is pulled in with document.write. That is deliberate: it is the
   one mechanism that loads a chosen script synchronously at parse time, which
   is what keeps the ordering above intact. An async loader would mean the
   product push fires before the catalog exists.
   ========================================================================== */
(function () {
  'use strict';

  var DEFAULT = 'beauty';
  var KEY = 'demo.vertical';

  /* --- environments -------------------------------------------------------
     A page carries one Insider tag, and a tag belongs to one account. So the
     account is decided by the hostname, via a suffix on the subdomain:

         beauty.insiderdemo.com           -> partnersandbox   (temporary)
         beauty-sandbox.insiderdemo.com   -> partnersandbox

     Locale and currency travel with the account, because they have to match
     the catalog the feed was loaded into.

     TEMPORARY — every subdomain currently points at partnersandbox.
     salesdemo has no working catalog or Eureka campaign for this build yet,
     so a bare subdomain served the wrong catalogue and Eureka returned
     records the renderer could not read. Rather than have half the estate
     broken, both environments resolve to the account that actually works.

     TO RESTORE the split once salesdemo's catalog is fixed: put the
     commented values below back into 'default'. Nothing else changes —
     the suffix mechanism is untouched and '-sandbox' keeps working
     throughout, so the switch is one edit here plus a deploy.
     --------------------------------------------------------------------- */
  var ENVIRONMENTS = {
    /* The bare subdomain runs on salesdemo, which already has Agent One, user
       engagement recommendations and a much richer attribute set. The
       -sandbox alias stays on partnersandbox, so both accounts are reachable
       from the same codebase and the same deploy:

           fashion.insiderdemo.com          -> salesdemo
           fashion-sandbox.insiderdemo.com  -> partnersandbox

       LOCALE. en_GB/EUR on salesdemo too, and deliberately NOT en_US.
       salesdemo's own catalogue lives in en_US, and an XML integration is
       configured per locale — so loading the master feed there would merge
       17,092 records into the same index as the existing products and neither
       catalogue would be trustworthy again. A separate locale keeps them
       apart, which is the same reason partnersandbox was built en_GB/EUR.

       The pair is load-bearing: a mismatch here silently returns the wrong
       catalogue rather than erroring. */
    /* The bare subdomain is salesdemo — its eventual home. It has Agent One,
       user-engagement recommendations, a far richer attribute set and a
       working onsite campaign history.

       UNTIL THE FEED LANDS THERE, these hostnames have no catalogue: search
       and category pages fall back to the local one and recommendation slots
       render nothing. That is deliberate rather than broken. Build and demo on
       -sandbox meanwhile, which stays on partnersandbox and has everything.

       Locale is en_GB/EUR here too, NOT en_US. An XML integration is per
       locale and salesdemo's own catalogue is en_US, so sharing the locale
       would merge 17,092 records into it and neither would be trustworthy. */
    /* SALESDEMO SWITCH. salesdemo has no working catalogue or Eureka index
       for this build yet, so the bare hostnames run on partnersandbox for
       now: the same account as -sandbox, so every campaign, journey and agent
       just works there. The page still knows it is the bare hostname
       (ENVIRONMENT_KEY stays 'default'), so SC-only pages and links behave
       as on sales demo. To restore the split: flip SALESDEMO_READY to true
       and deploy. Nothing else changes.

       The bare hostnames must be in partnersandbox's multiDomains for the
       tag to load on them while the switch is off. */
    'default': (function () {
      var SALESDEMO_READY = false;
      return SALESDEMO_READY
        ? { suffix: null, account: 'salesdemo',      partnerId: '10002548', locale: 'en_GB', currency: 'EUR' }
        : { suffix: null, account: 'partnersandbox', partnerId: '10006846', locale: 'en_GB', currency: 'EUR' };
    })(),
    'sandbox': {
      suffix: '-sandbox', account: 'partnersandbox', partnerId: '10006846',
      locale: 'en_GB', currency: 'EUR'
    }
  };

  function resolveEnvironment(sub) {
    for (var key in ENVIRONMENTS) {
      var env = ENVIRONMENTS[key];
      if (env.suffix && sub && sub.slice(-env.suffix.length) === env.suffix) {
        return { key: key, env: env, vertical: sub.slice(0, -env.suffix.length) };
      }
    }
    return { key: 'default', env: ENVIRONMENTS['default'], vertical: sub };
  }

  // Hostnames that are never a vertical — the apex, www, and Netlify's own.
  var RESERVED = ['www', 'insiderdemo', 'localhost', 'netlify'];

  function fromSubdomain() {
    var parts = location.hostname.split('.');
    if (parts.length < 3) return null;            // apex domain or localhost
    var sub = parts[0].toLowerCase();
    if (RESERVED.indexOf(sub) > -1) return null;
    if (/^deploy-preview|^branch-/.test(sub)) return null;
    return sub;
  }

  function pick() {
    // Subdomain wins in production; ?v= is the local and preview escape hatch.
    var sub = fromSubdomain();
    if (sub) return sub;

    var q = new URLSearchParams(location.search).get('v');
    if (q) {
      try { localStorage.setItem(KEY, q); } catch (e) {}
      return q;
    }
    try { return localStorage.getItem(KEY) || DEFAULT; } catch (e) { return DEFAULT; }
  }

  var raw = pick();
  var resolved = resolveEnvironment(fromSubdomain() ? raw : null);
  var vertical = resolved.vertical || raw;

  window.VERTICAL_KEY = vertical;
  window.ENVIRONMENT = resolved.env;


  window.ENVIRONMENT_KEY = resolved.key;

  /* --- favicon ------------------------------------------------------------
     One estate, twelve storefronts, so the tab mark is the Insider One ring
     recoloured per vertical — same shape, twelve hues. Injected here rather
     than in each page's <head> because the vertical is only known once the
     hostname has resolved, and putting it in twelve HTML files would drift.

     Runs immediately, not on DOMContentLoaded: browsers request the favicon
     early, and a late <link> means a flash of the default page icon.

     `apple-touch-icon` is included so a bookmarked storefront on iOS gets the
     mark rather than a screenshot of the page. */
  (function favicon() {
    var href = 'assets/img/favicon/' + vertical + '.svg';
    // Pages all sit at the site root, so a relative path is correct. Absolute
    // would break local preview and the ?v= URLs.
    [['icon', 'image/svg+xml'], ['apple-touch-icon', null]].forEach(function (pair) {
      var link = document.createElement('link');
      link.rel = pair[0];
      if (pair[1]) link.type = pair[1];
      link.href = href;
      document.head.appendChild(link);
    });
  })();

  /* --- legacy insider_object seed ----------------------------------------
     This MUST run before ins.js is written, and it is inline rather than a
     separate file so the ordering cannot drift.

     The tag reads page data through:

         getInsiderObject = Insider.insiderObject || window.insider_object

     `Insider.insiderObject` is built by draining window.InsiderQueue — the
     Web SDK path — and that is gated on an account flag (`inioa` in the
     served ins.js). It is FALSE on partnersandbox, so the queue is never
     consumed: pushes pile up, insiderObject stays undefined, and everything
     that reads the IO falls back to defaults or is simply never sent.

     Two consequences, both silent:

       1. System rules return their hard-coded defaults. getLang reads
          getDataFromIO('user','language','en_US'), so getLocale resolves to
          en_US and Eureka serves the wrong locale's index.

       2. No user data reaches Insider at all. The Hit API builds its payload
          from getValidUserData(), which reads through getInsiderObject() —
          so uuid, email, opt-ins and custom attributes are never sent, and
          no profile appears in the panel.

     Seeding the legacy global fixes both, because the tag falls back to it
     and takes the legacy path anyway when `inioa` is false.

     Load order matters: getLocale caches on first call, and the Hit API
     builds its payload during init, so this has to run before ins.js.

     REMOVE THIS once Web SDK ingestion is enabled on the account:
     Insider.insiderObject then takes precedence automatically, and one
     source of page data is better than two.
     --------------------------------------------------------------------- */
  (function seedInsiderObject(env) {
    var locale = env.locale || 'en_GB';
    var currency = env.currency || 'EUR';
    var io = window.insider_object = window.insider_object || {};

    io.user = io.user || {};

    /* Language carries the locale, and getLang splits on "_" and validates the
       country half against its own list — "en" permits GB, so en_GB passes
       through and getLocale returns it whole. That is all the platform needs
       to match the catalogue.

       COUNTRY IS DELIBERATELY NOT SET.

       It used to be, derived from the locale string: en_GB gave GB, written on
       every page load. Which meant every visitor on this estate was recorded as
       being in the United Kingdom regardless of where they actually were — the
       site was overwriting the country the platform had derived from their IP.

       It showed up as a contradiction on a profile: City said Dublin, from the
       IP, and Country said GB, from us. The two cannot both be right.

       That matters beyond tidiness. Location segments and Weather rules key off
       the platform's own geo, and a hard-coded country either fights it or
       quietly wins. A demo whose whole point is "we know where this visitor is"
       cannot also be telling the platform where they are.

       So the site says nothing about location and lets the platform work it
       out. A country typed by a person at checkout is different and is still
       sent — see seedProfileFromStorage below. */
    io.user.language = locale;

    // getCurrency checks basket, then product, then transaction currency
    // before falling back to the account default. Seeding basket covers every
    // page type without implying the cart has items in it.
    io.basket = io.basket || {};
    if (io.basket.currency == null) io.basket.currency = currency;

    /* --- full user payload -----------------------------------------------
       store.js builds the real payload — uuid, identifiers, opt-ins, custom
       attributes — and pushes it to InsiderQueue, where nothing consumes it.
       Merge the same object in here so the Hit API can actually send it.

       store.js loads after this file and after the catalog, which for the
       larger verticals is several thousand products, so it can be seconds
       away. Poll generously and also hook DOMContentLoaded, then stop.

       Merge rather than replace, so the locale and country set above survive
       if the payload omits them.

       The uuid matters more than it looks: the panel's User Profiles detail
       page is keyed on it. Without this, no profile exists to open.
       ------------------------------------------------------------------ */
    /* --- the profile, synchronously ---------------------------------------
       THE PROBLEM THIS SOLVES. The merge below waits for window.Store, which
       loads after this file AND after the catalog — catalogs/home.js is 8.9MB,
       so it can be seconds away. ins.js does not wait. The Hit API builds its
       payload during init from whatever io.user holds at that moment, which
       was language and country and nothing else, and it never rebuilds.

       The result was an asymmetry that looked like nothing was working, and
       was worse than that: CUSTOM attributes still landed, because the merge
       calls sendUserAttributes() explicitly once Store appears. STANDARD ones
       — email, name, surname, phone_number, city, the opt-ins — had no second
       chance and were lost silently.

       store.js is not actually needed for any of this. signIn() writes the
       profile to localStorage synchronously, and this file runs before the
       tag. So read storage directly and build io.user here, with no dependency
       on load order. The merge below still runs afterwards and refines what it
       finds — preferred_category comes from view history that only store.js
       tracks — but the identity no longer depends on it arriving in time.

       Deliberately duplicates a little of userPayload(). The alternative is
       moving store.js ahead of the catalog, which is a bigger change to a file
       every page depends on, for a workaround that should disappear the moment
       Web SDK ingestion is enabled on the account.
       ------------------------------------------------------------------ */
    (function seedProfileFromStorage() {
      function readJSON(key) {
        try {
          var raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      }

      // Same keys store.js uses. Kept in sync by hand; if store.js renames
      // them this goes quiet rather than wrong, which the debug note catches.
      var visitor = null;
      try { visitor = localStorage.getItem('lmn.visitor'); } catch (e) {}
      var u = readJSON('lmn.user');

      if (visitor) io.user.uuid = visitor;
      io.user.gdpr_optin = true;

      if (!u) {
        if (window.insDebugNote) {
          window.insDebugNote('insider_object: anonymous visitor seeded', 'ok');
        }
        return;
      }

      // Standard attributes. Only set what exists, so an absent field does not
      // overwrite anything the merge finds later with an empty string.
      [['email', 'email'], ['name', 'name'], ['surname', 'surname'],
       ['phone_number', 'phone_number'], ['gender', 'gender'],
       ['birthday', 'birthday'], ['city', 'city']].forEach(function (pair) {
        if (u[pair[1]]) io.user[pair[0]] = u[pair[1]];
      });

      if (u.country) io.user.country = String(u.country).toUpperCase();
      io.user.email_optin = !!u.email_optin;
      io.user.sms_optin = !!u.sms_optin;
      io.user.whatsapp_optin = !!u.whatsapp_optin;
      if (u.gdpr_optin === false) io.user.gdpr_optin = false;

      io.user.custom = io.user.custom || {};
      io.user.custom.membership_tier = u.membership_tier || 'Bronze';
      io.user.custom.loyalty_points =
        typeof u.loyalty_points === 'number' ? u.loyalty_points : 0;
      io.user.custom.is_vip = u.membership_tier === 'Gold';
      if (u.signup_date) io.user.custom.signup_date = u.signup_date;
      if (u.preferred_store) io.user.custom.preferred_store = u.preferred_store;
      if (u.uuid) io.user.custom.account_id = u.uuid;

      if (window.insDebugNote) {
        window.insDebugNote('insider_object: profile seeded from storage — ' +
          (u.email || 'no email') + ', before the tag', 'ok');
      }
    })();

    var merged = false;

    function mergeUserPayload() {
      if (merged) return true;
      if (!(window.Store && window.Store.userPayload)) return false;
      try {
        var payload = window.Store.userPayload() || {};
        Object.keys(payload).forEach(function (k) {
          if (payload[k] === undefined) return;
          // Never let a payload value clobber the locale fields above.
          if (k === 'language' || k === 'country') return;
          io.user[k] = payload[k];
        });
        merged = true;
        if (window.insDebugNote) {
          window.insDebugNote('insider_object user seeded: ' +
            (payload.uuid || 'no uuid'), 'ok');
        }
        // The Hit API may already have built and sent its payload without
        // these fields. Resend the custom attributes so the profile is
        // populated either way; harmless if it was already correct.
        try {
          if (window.Insider && Insider.sendUserAttributes && payload.custom) {
            Insider.sendUserAttributes(payload.custom);
          }
        } catch (e) {}
        return true;
      } catch (e) { return false; }
    }

    if (!mergeUserPayload()) {
      var tries = 0;
      var t = setInterval(function () {
        if (mergeUserPayload() || ++tries > 600) clearInterval(t);
      }, 25);
      document.addEventListener('DOMContentLoaded', mergeUserPayload);
      window.addEventListener('load', mergeUserPayload);
    }

    /* --- re-merge on sign in / sign out ------------------------------------
       The merge above runs once, with whatever the user is at page load —
       usually anonymous. When someone signs in, store.js updates its own
       storage but nothing rebuilds the IO, so the profile keeps the Guest
       payload and the email never reaches the platform.

       Worse, the Hit API builds its payload during init and never resends,
       so even a corrected IO is not enough on its own: the attributes have
       to be pushed explicitly.

       Watch for the identity changing and redo both. Cheap, and it covers
       sign in, sign out, and profile edits without store.js needing to know
       this shim exists.
       ------------------------------------------------------------------- */
    var lastIdentity = null;

    function identityFingerprint() {
      try {
        var u = window.Store && window.Store.currentUser && window.Store.currentUser();
        return u ? (u.email || '') + '|' + (u.uuid || '') : 'anonymous';
      } catch (e) { return null; }
    }

    function syncIdentity() {
      var fp = identityFingerprint();
      if (fp === null || fp === lastIdentity) return;
      lastIdentity = fp;

      // Force a fresh read rather than the once-only merge.
      try {
        var payload = window.Store.userPayload() || {};
        Object.keys(payload).forEach(function (k) {
          if (payload[k] === undefined) return;
          if (k === 'language' || k === 'country') return;
          io.user[k] = payload[k];
        });

        // Send identifiers and attributes explicitly, since the Hit API will
        // not rebuild its payload on its own.
        if (window.Insider) {
          if (Insider.sendUserAttributes && payload.custom) {
            Insider.sendUserAttributes(payload.custom);
          }
          if (Insider.initializeHitAPI) {
            Insider.initializeHitAPI();
          }
        }

        if (window.insDebugNote) {
          window.insDebugNote('identity synced: ' +
            (payload.email || 'anonymous'), 'ok');
        }
      } catch (e) {}
    }

    // Poll rather than patching store.js, so the site stays unaware of this.
    // Cheap at this interval and stops mattering once the SDK path is on.
    setInterval(syncIdentity, 500);
    document.addEventListener('DOMContentLoaded', syncIdentity);

    /* --- page type, product, basket, transaction -------------------------
       The tag's page rules all read insider_object.page.type:

           isOnMainPage      -> 'Home'
           isOnCategoryPage  -> 'Category'
           isOnProductPage   -> 'Product'
           isOnCartPage      -> 'Basket'
           isOnAfterPaymentPage -> 'Confirmation'

       Without them every page resolves as "other", so User Profiles records
       "Other Page View" for the whole funnel and no product or purchase
       events are attributed. getCurrentProduct and getPaidProducts read
       insider_object.product and .basket for the same reason.

       The site already pushes exactly this data — the push TYPE is the page
       type ('home', 'product', ...) and its value is the payload. Mirror
       those pushes into the IO as they happen.

       Note the capitalisation: the rules compare against 'Home', 'Basket'
       and so on, while the pushes are lowercase. And the cart is called
       'basket' in the IO but pushed as 'basket' or 'cart' depending on the
       page, so both are mapped.
       ------------------------------------------------------------------ */
    var PAGE_TYPES = {
      home: 'Home',
      category: 'Category',
      product: 'Product',
      basket: 'Basket',
      cart: 'Basket',
      purchase: 'Confirmation',
      confirmation: 'Confirmation',
      other: 'Other'
    };

    /* --- basket shape ------------------------------------------------------
       The tag reads the cart as:

           getDataFromIO('basket', 'line_items')   ->  [{ product: {...},
                                                          quantity: n }, ...]

       The site pushes `items` instead, with the product fields flat on each
       entry and quantity among them. Two mismatches, and both fail silently:
       the tag sees an empty basket, logs a "Cart Clearance" event on the cart
       page, and never records add-to-cart or abandoned-cart behaviour.

       Translate rather than rename, and keep `items` in place as well so
       anything reading the original shape still works.
       ------------------------------------------------------------------- */
    function toLineItems(items) {
      if (!items || !items.length) return [];
      return items.map(function (it) {
        var line = (it && it.product) ? it : null;
        var qty = (it && it.quantity != null) ? it.quantity : 1;
        var p = line ? line.product : it;
        if (!p) return { product: {}, quantity: qty };

        /* The transaction object wants product_image_url, not the catalogue's
           own `image`, and it wants a per-line subtotal. Without those the line
           items are accepted but incomplete, and revenue reporting has nothing
           to break down by product. */
        if (p.image && !p.product_image_url) {
          p.product_image_url = p.image.indexOf('http') === 0
            ? p.image
            : location.origin + '/' + p.image.replace(/^\//, '');
        }
        var unit = Number(p.unit_sale_price != null ? p.unit_sale_price : p.unit_price) || 0;
        var out = line || { product: p, quantity: qty };
        if (out.subtotal == null) out.subtotal = Math.round(unit * qty * 100) / 100;
        return out;
      });
    }

    function applyPush(entry) {
      if (!entry || !entry.type) return;
      var type = String(entry.type).toLowerCase();

      // Page-type pushes set page.type and, where relevant, the object the
      // system rules read for that page.
      if (PAGE_TYPES[type]) {
        io.page = io.page || {};
        io.page.type = PAGE_TYPES[type];
        if (entry.value && typeof entry.value === 'object') {
          if (type === 'product') io.product = entry.value;
          else if (type === 'basket' || type === 'cart') {
            io.basket = io.basket || {};
            Object.keys(entry.value).forEach(function (k) {
              io.basket[k] = entry.value[k];
            });
            io.basket.line_items = toLineItems(entry.value.items ||
                                               entry.value.line_items);
          } else if (type === 'purchase' || type === 'confirmation') {
            io.transaction = entry.value || {};
            io.transaction.line_items = toLineItems(entry.value &&
              (entry.value.items || entry.value.line_items));

            /* CURRENCY IS REQUIRED AND WAS MISSING. confirmation.html sends
               order_id, total, shipping_cost and items — no currency. The tag
               falls back through basket, product, then transaction currency,
               so the page rendered fine and the purchase looked sent, but
               revenue never landed on the profile.

               Take it from the environment, which is the same source the
               catalogue and the feed use. */
            if (io.transaction.currency == null) {
              io.transaction.currency = currency;
            }
            if (io.transaction.total != null) {
              io.transaction.total = Number(io.transaction.total) || 0;
            }
          } else if (type === 'category') {
            io.listing = entry.value;
          }
        }
        return;
      }

      if (type === 'currency' && entry.value) {
        io.basket = io.basket || {};
        io.basket.currency = entry.value;
      }

      /* --- custom events ----------------------------------------------------
         Everything above translates a push into page data on the insider
         object, which the tag reads. An EVENT has nowhere to live there — it
         is not page state — so custom_event pushes had no route at all and
         went nowhere. That is why flow.html's `fitting_booked` never landed:
         the page is correct, the queue that carries it is not consumed.

         Insider.track is the SDK's own entry point and works on this account
         even with the queue path off. Confirmed by probe:

             Insider.track('custom_event', [{ event_name: …, event_params: … }])

         Same two arguments as the queue entry, split. So forward it.

         DELIBERATELY ONLY custom_event. Every other type already reaches the
         platform through the insider object above, and forwarding those too
         would send each one twice. If the other types are ever needed here,
         confirm they are not already landing before widening this.

         Remove the whole thing once `inioa` is enabled — the queue will be
         drained natively and this becomes a duplicate. */
      if (type === 'custom_event' && entry.value) {
        trackEvent(entry.value);
      }
    }

    /* ins.js may not have run yet when the first event is pushed, so hold
       anything that arrives early and flush once Insider.track exists.
       Gives up after about fifteen seconds rather than polling forever. */
    var pendingEvents = [];

    function flushEvents() {
      if (!(window.Insider && typeof Insider.track === 'function')) return false;
      while (pendingEvents.length) {
        var value = pendingEvents.shift();
        try {
          Insider.track('custom_event', value);
          if (window.insDebugNote) {
            var name = (value && value[0] && value[0].event_name) || 'event';
            window.insDebugNote('custom event sent via Insider.track: ' + name, 'ok');
          }
        } catch (e) {
          if (window.insDebugNote) {
            window.insDebugNote('Insider.track threw on a custom event: ' +
                                (e && e.message), 'error');
          }
        }
      }
      return true;
    }

    function trackEvent(value) {
      pendingEvents.push(value);
      if (flushEvents()) return;
      if (trackEvent.waiting) return;
      trackEvent.waiting = true;
      var tries = 0;
      var t = setInterval(function () {
        if (flushEvents() || ++tries > 600) {
          clearInterval(t);
          trackEvent.waiting = false;
          if (tries > 600 && window.insDebugNote) {
            window.insDebugNote('Insider.track never appeared — ' +
                                pendingEvents.length + ' custom event(s) dropped', 'error');
          }
        }
      }, 25);
    }

    // Anything already queued before this ran.
    try { (window.InsiderQueue || []).forEach(applyPush); } catch (e) {}

    // And everything pushed afterwards. Wrapping push here is the same
    // technique the telemetry console uses; both can coexist.
    try {
      window.InsiderQueue = window.InsiderQueue || [];
      var nativePush = window.InsiderQueue.push;
      window.InsiderQueue.push = function () {
        for (var i = 0; i < arguments.length; i++) applyPush(arguments[i]);
        return nativePush.apply(window.InsiderQueue, arguments);
      };
    } catch (e) {}
  })(resolved.env);

  // The tag is written here rather than inline in each page, because which
  // account it points at depends on the hostname. Account and id are plainly
  // readable above and in the console panel.
  document.write(
    '<script async src="//' + resolved.env.account +
    '.api.useinsider.com/ins.js?id=' + resolved.env.partnerId + '"><\/script>'
  );

  // Synchronous by design — see the note above. The second inline script runs
  // only after the catalog has executed, which is where the theme gets applied;
  // calling applyVertical() from here would run it too early and see no data.
  document.write(
    '<script src="catalogs/' + encodeURIComponent(vertical) + '.js"><\/script>' +
    '<script>window.applyVertical();<\/script>'
  );

  /* --- trip-banner local fallback --------------------------------------
     The disruption message is an Insider One onsite campaign reading
     trip_status / next_trip from the profile. In a live account that is the
     whole story. In a demo the campaign can render a beat late, or the
     profile write may not have propagated to the onsite renderer yet, and an
     empty navy bar is worse than no bar. So the site writes the SAME sentence
     into the slot from what it already knows about the signed-in profile; if
     the campaign then renders, it overwrites with identical text. One copy
     source (tripBannerText) keeps them from drifting. Only fires when the
     profile actually says Delayed/Cancelled, so it can never show a wrong or
     stale message. */
  function tripBannerText(status, trip, vkey) {
    var t = trip || 'your trip';
    var hotel = vkey === 'hotels';
    if (status === 'Delayed') {
      return hotel
        ? "There's a change to your " + t + " booking: your room isn't ready yet. We're holding it and the first drink's on us."
        : "There's a change to your " + t + " booking: it's running late at our end. We're holding it for you and will text the new time \u2014 and your first drink's on us.";
    }
    if (status === 'Cancelled') {
      return hotel
        ? "Your " + t + " booking was cancelled at our end. We've held the same room nearby \u2014 details are in your email."
        : "Your " + t + " booking was cancelled at our end. You're on the next departure at no charge \u2014 details are in your email.";
    }
    return '';
  }
  // Recognise a trip-status line so we only ever touch the disruption banner,
  // never the loyalty/tier campaign that shares the ins-tier-message class.
  function looksLikeTripLine(txt) {
    if (!txt) return false;
    return /change to your .* booking|running late|not ready|cancelled|holding it for you/i.test(txt);
  }

  /* --- tier / loyalty progress banner ------------------------------------
     Same problem, same fix as the trip banner. The tier campaign reads
     membership_tier / loyalty_points from the tag's per-session snapshot, so
     after a purchase (points changed) it can show the PREVIOUS tier/points
     until the next session. The site knows the live values from currentUser(),
     so it writes the correct sentence into the same .ins-tier-message element.
     One copy source (tierBannerText) keeps primary and backup identical.
     Scoped to storefronts that actually have an aspirational tier model
     (retail sub-verticals + travel); grocery/telco/banking have their own
     loyalty beats and are excluded via tier_banner in the vertical config. */
  function tierBannerText(tier, points) {
    // Must match the campaign Liquid ("points to next tier") exactly so the
    // site backup and the platform campaign never show different copy:
    //   guest/empty -> nothing; Gold -> top; Silver -> to Gold; anything
    //   else (Member, Blue, Bronze, any vertical's entry tier) -> to Silver.
    if (!tier || tier === 'Guest') return '';
    var p = (typeof points === 'number') ? points : 0;
    if (tier === 'Gold') return "You're Gold \u2014 our best benefits.";
    if (tier === 'Silver') return "You're " + Math.max(1500 - p, 0) + " points from Gold and its best benefits.";
    return "You're " + Math.max(500 - p, 0) + " points from Silver.";
  }
  function looksLikeTierLine(txt) {
    if (!txt) return false;
    return /points from (Silver|Gold)|You're Gold/i.test(txt);
  }
  /* --- signed-in relationship banner (telco, finance) --------------------
     Travel and retail close the loop after a flow: book -> the delay banner,
     buy -> the tier strip. Telco and finance need the same payoff. After
     subscribing / opening an account, the content homepage greets the
     customer with what they now have. Reads live currentUser(), so it appears
     the moment the flow writes the profile. Content verticals only. */
  function relationshipBannerText(u, vkey) {
    if (!u) return '';
    if (u.plan) {
      // telco subscriber
      if (u.data_used && u.data_allowance) {
        var used = Number(u.data_used), allow = Number(u.data_allowance);
        if (allow && used / allow >= 0.85) return "You're on " + u.plan + " and you've used " + used + " of " + allow + " GB \u2014 Unlimited would keep you connected.";
        return "Welcome back \u2014 you're on " + u.plan + ", " + used + " of " + allow + " GB used this month.";
      }
      return "Welcome back \u2014 you're on " + u.plan + (u.assigned_number ? ", number " + u.assigned_number : "") + ".";
    }
    if (u.product) {
      // finance customer
      if (u.customer_status === 'Referred to banker') return "Your " + u.product + " application is with one of our bankers \u2014 they'll call you shortly.";
      if (u.customer_status === 'Quote') return "Your " + (u.quote_cover || '') + " cover quote is saved \u2014 \u00a3" + (u.quote_premium || '') + "/mo. Pick up where you left off.";
      return "Welcome back, " + (u.name || '') + " \u2014 your " + u.product + " is open and ready.";
    }
    return '';
  }
  function fillRelationshipBanner() {
    try {
      if (!window.Store || !Store.currentUser) return;
      var v = window.VERTICAL || {};
      if (v.template !== 'content') return;   // content verticals only
      var paint = function () {
        var u = Store.currentUser();
        var msg = relationshipBannerText(u, v.key);
        var slot = document.getElementById('relationship-banner');
        if (!slot) {
          if (!msg) return;
          slot = document.createElement('div');
          slot.id = 'relationship-banner';
          slot.className = 'relationship-banner';
          var anchor = document.querySelector('.hero');
          if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor.nextSibling);
          else document.querySelector('main') && document.querySelector('main').insertBefore(slot, document.querySelector('main').firstChild);
        }
        if (msg) { slot.textContent = msg; slot.hidden = false; }
        else { slot.hidden = true; slot.textContent = ''; }
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
      else paint();
      setTimeout(paint, 600);
    } catch (e) {}
  }
  function fillTierFallback() {
    try {
      if (!window.Store || !Store.currentUser) return;
      var v = window.VERTICAL || {};
      if (!v.tier_banner) return;  // only where the tier model applies
      var paint = function () {
        var u = Store.currentUser() || {};
        var msg = tierBannerText(u.membership_tier, u.loyalty_points);
        var els = document.querySelectorAll('.ins-tier-message .ins-element-content, .ins-element-content');
        for (var i = 0; i < els.length; i++) {
          var el = els[i];
          var cur = (el.textContent || '').replace(/[\u00a0\u200b]/g, '').trim();
          var inTier = el.closest && el.closest('.ins-tier-message');
          if (msg) {
            // Overwrite a stale tier line, or fill an empty tier-message slot.
            if (looksLikeTierLine(cur) && cur !== msg) el.textContent = msg;
            else if (!cur && inTier) el.textContent = msg;
          } else {
            // Profile has no tier (Guest): clear a stale tier line.
            if (looksLikeTierLine(cur)) el.textContent = '';
          }
        }
      };
      paint();
      // Repaint a couple of times in case the campaign renders after us.
      setTimeout(paint, 400); setTimeout(paint, 1500);
    } catch (e) {}
  }
  function fillBannerFallback(slot) {
    try {
      if (!window.Store || !Store.currentUser) return;
      var v = window.VERTICAL || {};
      var paint = function () {
        var u = Store.currentUser() || {};
        var msg = tripBannerText(u.trip_status, u.next_trip, v.key);
        // The campaign renders the disruption line from its own lagging
        // snapshot, so it can show the PREVIOUS trip or nothing. Correct any
        // campaign banner element in place: if the profile has a message,
        // set it there when it differs; if the profile has no disruption,
        // clear a stale campaign line. .ins-element-content is the campaign's
        // text node; we only touch ones that look like a trip line (or are
        // empty children of a tier-message), never the loyalty campaign.
        var camp = document.querySelectorAll('.ins-tier-message .ins-element-content, .ins-element-content');
        for (var i = 0; i < camp.length; i++) {
          var el = camp[i];
          var cur = (el.textContent || '').replace(/[\u00a0\u200b]/g, '').trim();
          var inTier = el.closest && el.closest('.ins-tier-message');
          if (msg) {
            if (looksLikeTripLine(cur) && cur !== msg) el.textContent = msg;
            else if (!cur && inTier) el.textContent = msg;
          } else {
            if (looksLikeTripLine(cur)) el.textContent = '';
          }
        }
        // Hide the site's own duplicate slot: the campaign bar is the one on
        // screen. Keep the slot in the DOM as a fallback only if no campaign
        // element exists at all.
        if (slot) {
          var anyCamp = document.querySelector('.ins-tier-message .ins-element-content, .ins-element-content');
          if (anyCamp) { slot.style.display = 'none'; }
          else {
            slot.style.display = '';
            if (msg) { if (slot.textContent !== msg) slot.textContent = msg; slot.setAttribute('data-fallback','1'); }
            else slot.textContent = '';
          }
        }
      };
      paint();
      var mo = new MutationObserver(paint);
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      var t = 0, iv = setInterval(function () { paint(); if (++t >= 8) clearInterval(iv); }, 500);
      setTimeout(function () { mo.disconnect(); }, 10000);
    } catch (e) {}
  }

  /* --- theme + copy, applied once the catalog has parsed ----------------- */
  window.applyVertical = function () {
    var v = window.VERTICAL;
    /* Content-led verticals (banking, telco, insurance) have their own
       homepage. Every storefront boots through index.html; if this
       vertical is a content one and we are on the product homepage,
       hand off to content-index.html before it paints. Guarded so it
       only fires on the home page and never on the content page itself. */
    try {
      if (v && v.template === "content") {
        var f = (location.pathname.split("/").pop() || "index.html");
        if (f === "" || f === "index.html") {
          location.replace("content-index.html" + location.search + location.hash);
          return;
        }
      }
    } catch (e) {}
    if (v && v.banner_slot && !document.getElementById('trip-banner')) {
      /* A slot for the disruption beat. The onsite campaign fills it from
         the profile (trip_status, next_trip); the site itself puts nothing
         in it. Sits directly under the header on every page. */
      var placeSlot = function () {
        if (document.getElementById('trip-banner')) return;
        // Homepage only, to match the disruption campaign's page rule. The
        // homepage is the one page with a hero; other pages get no banner.
        if (!document.querySelector('.hero')) return;
        var slot = document.createElement('div');
        slot.id = 'trip-banner';
        slot.className = 'trip-banner';
        slot.setAttribute('data-trip-banner', '');
        /* Below the fold, not under the header: the campaign arrives a beat
           after first paint, and a banner landing above the hero would push
           the whole page down as it appears. After the hero, the shift is
           where nobody is looking yet. Pages without a hero fall back to
           just under the header. */
        var anchor = document.querySelector('.hero');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(slot, anchor.nextSibling);
        fillBannerFallback(slot);
      };
      // applyVertical runs from the catalog script in <head>, before the
      // header exists, so the slot is placed once the body has parsed.
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeSlot);
      else placeSlot();
    }

    /* Tier progress banner backup: runs on every page for tier-model
       storefronts (v.tier_banner), correcting a stale/blank tier campaign
       line from the live profile. Self-gates and only touches tier lines. */
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillTierFallback);
    else fillTierFallback();
    fillRelationshipBanner();
    if (v) {
    /* A vertical can carry its own locale and currency — Canon is en_CA / CAD
       in its own catalog locale on the same account, so the SDK's product
       object, the money formatting and the Eureka language all have to say
       en_CA on that storefront, whatever the account's default locale is.
       Done here, once the catalog file has set window.VERTICAL, and before
       anything reads ENVIRONMENT for a locale. */
      if (v.locale || v.currency) {
      var envCopy = {};
      for (var ek in window.ENVIRONMENT) envCopy[ek] = window.ENVIRONMENT[ek];
        if (v.locale) envCopy.locale = v.locale;
      if (v.currency) envCopy.currency = v.currency;
      window.ENVIRONMENT = envCopy;
    }
    }
    if (!v) {
      // Unknown vertical in the URL — fall back rather than render an empty store.
      if (vertical !== DEFAULT && !fromSubdomain()) {
        try { localStorage.setItem(KEY, DEFAULT); } catch (e) {}
        location.replace(location.pathname + '?v=' + DEFAULT);
      } else if (fromSubdomain()) {
        // Subdomain names a vertical that was never built. Say so plainly
        // rather than silently showing a different store.
        document.addEventListener('DOMContentLoaded', function () {
          document.body.innerHTML =
            '<div style="font:16px/1.6 system-ui;max-width:34rem;margin:6rem auto;padding:0 1.5rem">' +
            '<h1 style="font-weight:500">No such vertical</h1>' +
            '<p>Nothing is built for <code>' + vertical + '</code>. ' +
            'Add it to <code>verticals.json</code> and run <code>python3 build.py ' +
            vertical + '</code>.</p></div>';
        });
      }
      return;
    }

    var t = v.theme || {};
    var root = document.documentElement;
    root.setAttribute('data-vertical', v.key);
    [['bg', '--bg'], ['alt', '--alt'], ['ink', '--ink'], ['muted', '--muted'],
     ['rule', '--rule'], ['accent', '--accent']].forEach(function (pair) {
      if (t[pair[0]]) root.style.setProperty(pair[1], t[pair[0]]);
    });
    if (t.accent) root.style.setProperty('--sale', t.accent);
    if (t.display) root.style.setProperty('--display', t.display);
    if (t.body) root.style.setProperty('--body', t.body);

    if (t.fonts) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?' + t.fonts + '&display=swap';
      document.head.appendChild(link);
    }
  };

  /* --- keep ?v= across navigation --------------------------------------- */
  // Links are written without the parameter; rewriting them here means the
  // page templates stay vertical-agnostic.
  document.addEventListener('DOMContentLoaded', function () {
    var v = window.VERTICAL_KEY;
    // On a subdomain the hostname already carries the vertical, so links stay
    // clean. Only local and preview URLs need the parameter appended.
    if (!fromSubdomain()) {
      document.querySelectorAll('a[href]').forEach(function (a) {
        var href = a.getAttribute('href');
        if (!href || /^(https?:|mailto:|tel:|#)/.test(href)) return;
        if (/[?&]v=/.test(href)) return;
        a.setAttribute('href', href + (href.indexOf('?') > -1 ? '&' : '?') + 'v=' + v);
      });
    }

    // Brand and copy come from the catalog file, so one template serves all.
    var d = window.VERTICAL || {};
    set('[data-brand]', d.brand);
    set('[data-announce]', d.announce);
    /* Content verticals own their hero and tiles (content-index.html sets them
       from d.content); do not overwrite with the product-home copy. */
    var isContent = d.template === 'content';
    if (!isContent) {
      set('[data-hero-lede]', d.hero_lede);
      set('[data-hero-cta]', d.hero_cta);
      set('[data-hero-eyebrow]', d.hero_eyebrow);
      set('[data-tiles-title]', d.tiles_title);
      set('[data-grid-title]', d.grid_title);
    }
    // The top recommendation row is New Arrivals, so it takes the vertical's
    // "new in" wording (New routes, New models…) rather than the cross-sell
    // phrasing reco_title carried for the old static layout.
    set('[data-reco-title]', d.grid_title || d.reco_title);
    set('[data-reco-sale-title]', d.sale_title);
    set('[data-reco-foot-title]', d.reco_foot_title);
    set('[data-newsletter-title]', d.newsletter_title);
    set('[data-newsletter-lede]', d.newsletter_lede);

    /* The service journey — the non-transactional path that matters for
       banking, insurance and telco, where nobody adds a policy to a basket.
       Every vertical configures its own wording: "Book a fitting" on fashion,
       "Get a quote" on insurance, "Manage a trip" on airlines.

       The link used to appear only in flow.html's own masthead, so the page
       was unreachable unless you already knew the URL. It is in every
       masthead now; this gives it the right words. */
    var flow = d.flow || {};
    if (flow.title) set('[data-flow-link]', flow.title);
    /* Content verticals (telco, finance) retired the generic flow.html funnel
       for a purpose-built one (topup.html). Repoint the flow link there so it
       never lands on the dead page — and hide it outright when the content nav
       already carries the same action (telco's "Top up" -> topup.html), so it
       isn't a duplicate. */
    if (d.template === 'content') {
      /* Content verticals (telco, finance) always enter their funnel from a
         specific product card ("Open an account", "Apply for a card", "Choose
         plan") — which carries the chosen product into the flow. A generic
         "Start an application" / "Top up" masthead link is redundant and lands
         you on an awkward no-product-selected state, so remove it entirely. */
      document.querySelectorAll('[data-flow-link]').forEach(function (a) { a.remove(); });

      /* A telco/bank self-service app has no shopping cart — you don't add a
         plan or an account to a basket, you apply for it. Remove the cart link
         from the masthead entirely on content verticals. */
      document.querySelectorAll('.cartlink').forEach(function (a) { a.remove(); });
    }

    /* --- the sandbox orientation link --------------------------------------
       -sandbox hostnames only. These are the copies colleagues and prospects
       are pointed at, and they arrive with no idea what they are looking at or
       how to see the platform working. The bare subdomains are the polished
       ones and stay clean.

       Injected here rather than added to ten HTML files, and only when the
       resolved environment is the sandbox one — so it cannot leak onto a
       storefront being demoed. */
    /* --- demo links, top right of the announce bar --------------------------
       Where these go matters more than it looks.

       The FOOTER is where this kind of thing usually lives, and it is where it
       goes unfound. The UTILS NAV is discoverable but wrong: "Feedback" sitting
       beside Cart and Log in breaks the illusion of a real shop at exactly the
       moment a prospect is meant to forget they are looking at a demo.

       The announce bar is neither. It is the top of every page, always visible,
       and already non-product chrome — so brand copy keeps the middle and the
       demo links sit to the right, plainly not part of the storefront.

       Ask a question appears everywhere. The sandbox copies are the ones
       customers get hands on, so that is where questions actually come from —
       someone exploring alone, without a person beside them to ask. The bare
       storefronts are usually being demoed by a colleague who is answering in
       real time, so the link matters less there, but it costs nothing.

       Start here is sandbox-only, and it is a guided route rather than a page
       of tips: three acts, in order, ending with the visitor looking at their
       own profile filling up. The sandbox is where a customer explores before
       buying, usually alone and with no stated goal — so the page supplies the
       goal the environment does not. On the bare storefronts a colleague is
       driving, and a guide would be in the way.

       Injected here rather than added to a dozen HTML files. */
    /* --- the ad link, in the footer ------------------------------------------
       ad.html is linked from nowhere else, so without this nobody finds it
       unless they are told. The footer is the right home: a shop would
       plausibly link its own social advertising there, and it does not crowd
       the masthead or the demo links at the top.

       Every storefront, not only the sandbox ones. A shop linking its own
       advertising is ordinary, and the arrival beat is worth being findable
       wherever someone lands. */
    (function adLink() {
      if (document.querySelector('[data-ad-link]')) return;
      if (/ad\.html$/.test(location.pathname)) return;
      document.querySelectorAll('.foot__in').forEach(function (host) {
        var a = document.createElement('a');
        a.href = 'ad.html';
        a.textContent = 'See our latest Facebook ad';
        a.setAttribute('data-ad-link', '');
        a.style.cssText = 'margin-left:1.25rem;text-decoration:underline';
        var last = host.lastElementChild;
        if (last) last.appendChild(a); else host.appendChild(a);

        /* Help centre: static pages per storefront under help/<key>/, the
           Shopping Agent's knowledge base is crawled from them, and a
           visitor can read the same answers. */
        var help = document.createElement('a');
        help.href = 'help/' + window.VERTICAL_KEY + '/index.html';
        help.textContent = 'Help centre';
        help.setAttribute('data-help-link', '');
        help.style.cssText = 'margin-left:1.25rem;text-decoration:underline';
        (host.lastElementChild || host).appendChild(help);
      });
    })();

    (function demoLinks() {
      var bar = document.querySelector('.announce');
      if (!bar || bar.querySelector('[data-demo-links]')) return;

      var sandbox = window.ENVIRONMENT_KEY === 'sandbox';
      var here = location.pathname;
      var links = sandbox
        ? [['about.html', 'Start here'], ['ask.html', 'Ask a question'],
           ['feedback.html', 'Feedback']]
        : [['sc.html', 'SC notes'], ['feedback.html', 'Feedback']];

      var wrap = document.createElement('span');
      wrap.setAttribute('data-demo-links', '');
      wrap.style.cssText =
        'position:absolute;right:1rem;top:50%;transform:translateY(-50%);' +
        'display:flex;gap:1.1rem;letter-spacing:.04em';

      links.forEach(function (l) {
        if (here.indexOf(l[0]) > -1) return;      // don't link to the page you are on
        var a = document.createElement('a');
        a.href = l[0];
        a.textContent = l[1];
        a.style.cssText = 'color:inherit;opacity:.72;text-decoration:none;' +
                          'border-bottom:1px solid rgba(255,255,255,.35)';
        a.addEventListener('mouseenter', function () { a.style.opacity = '1'; });
        a.addEventListener('mouseleave', function () { a.style.opacity = '.72'; });
        wrap.appendChild(a);
      });

      if (!wrap.children.length) return;
      bar.style.position = 'relative';
      bar.appendChild(wrap);
    })();
    if (d.template !== 'content') setHTML('[data-hero-title]', d.hero_title);


    /* Reveal the page once the hero image has actually decoded, not merely once
       its src has been set. Revealing earlier means the text arrives, then the
       photograph pops in a beat later — the same flicker moved rather than
       removed.

       Capped, because a slow or broken image must not hold the page. */
    function revealPage(cap) {
      var done = false;
      function go() {
        if (done) return;
        done = true;
        document.documentElement.classList.add('hero-ready');
      }
      var img = document.getElementById('hero-img');
      if (!img || !img.getAttribute('src')) { go(); return; }
      if (img.complete && img.naturalWidth) { go(); return; }
      img.addEventListener('load', go);
      img.addEventListener('error', go);
      setTimeout(go, cap || 900);
    }

    /* Reveal the hero — but only if nothing else is about to rewrite it.

       On a campaign arrival the onsite campaign paints a different headline
       and a different photograph a frame or two after this runs. Revealing
       here would show the default first and the campaign second, which is the
       flicker anti-flicker exists to prevent. So on those page loads we stay
       hidden and let the campaign reveal instead.

       The test is the URL rather than a platform signal, because there is no
       event that fires to say "no campaign applies to this page". A UTM is
       present on exactly the arrivals a campaign targets, and index.html's
       failsafe covers the case where one is present but no campaign runs. */
    if (!/[?&]utm_/.test(location.search)) {
      revealPage(700);
    }

    /* --- category links in the templates ----------------------------------
       The page templates were written against beauty, so the hero button and
       the "View all" link both point at category.html?c=Makeup. The COPY is
       templated above — every vertical gets the right words — but the HREF
       never was, so Ashford Lane's "Shop new in" led to a Makeup collection
       that does not exist in fashion: page renders, Eureka declines to serve
       it, nought products.

       Repoint anything aimed at a collection this vertical does not have.
       Destination is `hero_category` from verticals.json, chosen to match each
       vertical's own hero copy — fashion says "Dress for the life you have"
       and now lands on Dresses rather than Tops, which is merely first in the
       order. Falls back to the first collection if none is declared.

       Only rewrites links whose target is genuinely absent, so a template that
       already names a real collection is left alone. And affinity.js sets the
       hero href itself when it swaps the hero; it registers its handler after
       this one, so it wins, which is correct — a hero about outerwear should
       lead to outerwear. */
    (function fixCategoryLinks() {
      var cols = Object.keys(window.COLLECTIONS || {});
      if (!cols.length) return;

      var target = d.hero_category;
      if (!target || cols.indexOf(target) === -1) {
        if (target && window.insDebugNote) {
          window.insDebugNote('hero_category "' + target + '" is not a collection ' +
                              'in this vertical — falling back to "' + cols[0] + '"', 'warn');
        }
        target = cols[0];
      }

      document.querySelectorAll('a[href*="category"]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var m = /[?&]c=([^&#]*)/.exec(href);
        if (!m) return;
        if (cols.indexOf(decodeURIComponent(m[1])) > -1) return;   // real here, leave it
        a.setAttribute('href',
          href.replace(/([?&]c=)[^&#]*/, '$1' + encodeURIComponent(target)));
      });
    })();

    // Journey wording — "Add to cart" becomes "Reserve", "Get a quote" and so on.
    var labels = d.labels || {};
    document.querySelectorAll('[data-label]').forEach(function (n) {
      var v = labels[n.getAttribute('data-label')];
      if (v) n.textContent = v;
    });
    if (d.template !== 'content') document.querySelectorAll('[data-search-placeholder]').forEach(function (n) {
      if (d.search_placeholder) n.setAttribute('placeholder', d.search_placeholder);
    });
    if (d.brand) {
      document.title = document.title.replace(/—.*$/, '— ' + d.brand).trim();
      if (document.title.indexOf(d.brand) === -1) document.title += ' — ' + d.brand;
    }

    function set(sel, val) {
      if (val == null) return;
      document.querySelectorAll(sel).forEach(function (n) { n.textContent = val; });
    }
    function setHTML(sel, val) {
      if (val == null) return;
      document.querySelectorAll(sel).forEach(function (n) { n.innerHTML = val; });
    }
  });
})();
