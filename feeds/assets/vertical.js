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

  var vertical = pick();
  window.VERTICAL_KEY = vertical;

  // Synchronous by design — see the note above. The second inline script runs
  // only after the catalog has executed, which is where the theme gets applied;
  // calling applyVertical() from here would run it too early and see no data.
  document.write(
    '<script src="catalogs/' + encodeURIComponent(vertical) + '.js"><\/script>' +
    '<script>window.applyVertical();<\/script>'
  );

  /* --- theme + copy, applied once the catalog has parsed ----------------- */
  window.applyVertical = function () {
    var v = window.VERTICAL;
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
    set('[data-hero-lede]', d.hero_lede);
    set('[data-hero-cta]', d.hero_cta);
    set('[data-newsletter-title]', d.newsletter_title);
    set('[data-newsletter-lede]', d.newsletter_lede);
    setHTML('[data-hero-title]', d.hero_title);

    // Journey wording — "Add to cart" becomes "Reserve", "Get a quote" and so on.
    var labels = d.labels || {};
    document.querySelectorAll('[data-label]').forEach(function (n) {
      var v = labels[n.getAttribute('data-label')];
      if (v) n.textContent = v;
    });
    document.querySelectorAll('[data-search-placeholder]').forEach(function (n) {
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
