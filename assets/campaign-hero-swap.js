/* Onsite Experiment — "Paid social arrival" — one campaign, twelve storefronts
   ---------------------------------------------------------------------------
   Rule:     URL contains  utm_source=meta
   Platform: Web
   Design:   custom JavaScript (not Action Builder — see below)

   WHY JAVASCRIPT RATHER THAN ACTION BUILDER

   Action Builder edits a specific element with specific content, so one
   campaign can only ever say one thing. Twelve storefronts need twelve
   headlines, which would mean twelve campaigns differing only in copy.

   The copy table below lives in the CAMPAIGN, not on the site. That matters:
   the site is not helping. Everything the visitor sees after the click is
   delivered by the platform, which is exactly the claim beat 2 is making.

   HOW IT KNOWS WHERE IT LANDED

   From the hostname, the same way the estate resolves everything else. It
   does not read window.VERTICAL, deliberately — a campaign that depends on
   the site's own globals is a weaker demo, because the obvious question is
   "so the site told it?". The hostname is the platform's own information.
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  var COPY = {
    fashion: {
      eyebrow: 'Outerwear',
      title:   "The coat you'll wear<br>until March.",
      lede:    'New in, and built for the walk to the station.',
      cta:     'Shop outerwear',
      href:    'category.html?c=Outerwear',
      image:   'https://insiderdemo.com/assets/img/fashion/8650096967740-0.jpg',
      product: 'product.html?id=43463778435132'
    },
    beauty: {
      eyebrow: 'Shade finder',
      title:   'Shade matched,<br>not guessed.',
      lede:    'Ninety seconds, or book a consultation and we will do it with you.',
      cta:     'Find your shade',
      href:    'category.html?c=Makeup',
      image:   'https://insiderdemo.com/assets/img/fashion/8884488831036-0.jpg',
      product: 'product.html?id=44197113626684'
    },
    home: {
      eyebrow: 'Design consultation',
      title:   'Start with the<br>room, not the sofa.',
      lede:    'Free consultation, no obligation, delivery and assembly included.',
      cta:     'Book a consult',
      href:    'category.html?c=Seating',
      image:   'https://insiderdemo.com/assets/img/home/9286863519906-0.jpg',
      product: 'product.html?id=47466592043170'
    },
    luxury: {
      eyebrow: 'The edit',
      title:   'Fewer things.<br>Better ones.',
      lede:    'A small, considered selection. By appointment, in store or online.',
      cta:     'See the edit',
      href:    'category.html?c=Bags',
      image:   'https://insiderdemo.com/assets/img/luxury/9491286163694-0.jpg',
      product: 'product.html?id=49510196576494'
    },
    electronics: {
      eyebrow: 'Installation included',
      title:   'Sounds better<br>than it looks.',
      lede:    'Installation included on every speaker over €300.',
      cta:     'Shop speakers',
      href:    'category.html?c=Speaker',
      image:   'https://insiderdemo.com/assets/img/electronics/7625455042749-0.jpg',
      product: 'product.html?id=43529575563453'
    },
    supermarket: {
      eyebrow: 'Same-day slots',
      title:   'Book the slot.<br>We will do the rest.',
      lede:    'Same-day delivery on orders placed before eleven.',
      cta:     'Book a slot',
      href:    'category.html?c=Ingredients',
      image:   'https://insiderdemo.com/assets/img/supermarket/7573936341050-0.jpg',
      product: 'product.html?id=41524982939706'
    },
    telco: {
      eyebrow: 'No lock-in',
      title:   'Better signal.<br>Fewer surprises.',
      lede:    'Keep your number. No mid-contract price rises.',
      cta:     'Shop devices',
      href:    'category.html?c=Iphone%2017%20Pro',
      image:   'https://insiderdemo.com/assets/img/telco/8928682770568-0.jpg',
      product: 'product.html?id=45914960494728'
    },
    hotels: {
      eyebrow: 'Flexible rates',
      title:   'Somewhere to<br>actually stop.',
      lede:    'Free cancellation up to forty-eight hours before arrival.',
      cta:     'Find a room',
      href:    'category.html?c=Hotels',
      image:   'https://insiderdemo.com/assets/img/hotels/lisbon.jpg',
      product: 'product.html?id=48100000000001'
    },
    airlines: {
      eyebrow: 'Seat selection included',
      title:   'Pick your seat<br>when you book.',
      lede:    'Not at the gate, and not for an extra fee.',
      cta:     'Search flights',
      href:    'category.html?c=Long%20Haul',
      image:   'https://insiderdemo.com/assets/img/airlines/london-new-york.jpg',
      product: 'product.html?id=48200000000001'
    },
    banking: {
      eyebrow: 'Ten minutes',
      title:   'An account that<br>does the admin.',
      lede:    'No monthly fee, no minimum balance, open it on your phone.',
      cta:     'Open an account',
      href:    'category.html?c=Accounts',
      image:   'https://insiderdemo.com/assets/img/banking/ardent-current-account.svg',
      product: 'product.html?id=48300000000009'
    },
    insurance: {
      eyebrow: 'Quote in two minutes',
      title:   'A quote today.<br>Good for thirty days.',
      lede:    'Car, home, travel and pet — compare cover levels side by side.',
      cta:     'Get a quote',
      href:    'category.html?c=Motor',
      image:   'https://insiderdemo.com/assets/img/insurance/northbank-insure-car-insurance.svg',
      product: 'product.html?id=48400000000001'
    },
    fintech: {
      eyebrow: 'Cards in seconds',
      title:   'Set the limit<br>before the spend.',
      lede:    'Issue a card in seconds. Your finance team stops chasing receipts.',
      cta:     'Explore plans',
      href:    'category.html?c=Business',
      image:   'https://insiderdemo.com/assets/img/fintech/kite-money-expense-cards.svg',
      product: 'product.html?id=48500000000029'
    }
  };

  function vertical() {
    var parts = location.hostname.split('.');
    if (parts.length < 3) return null;                 // apex or localhost
    var key = parts[0].replace(/-sandbox$/, '');       // fashion-sandbox -> fashion
    return COPY[key] ? key : null;
  }

  var key = vertical();
  if (!key) return;                                    // unknown host, change nothing
  var copy = COPY[key];

  function apply() {
    var title = document.querySelector('[data-hero-title]');
    if (!title) return false;

    var eyebrow = document.querySelector('[data-hero-eyebrow]');
    var lede    = document.querySelector('[data-hero-lede]');
    var cta     = document.querySelector('[data-hero-cta]');

    if (eyebrow) eyebrow.textContent = copy.eyebrow;
    title.innerHTML = copy.title;
    if (lede) lede.textContent = copy.lede;
    if (cta) { cta.textContent = copy.cta; cta.setAttribute('href', copy.href); }

    /* The image matters as much as the words. index.html sets #hero-img to the
       first featured product and affinity.js swaps it by browsing history, so
       leaving it alone means the headline says "coat" over a photograph of a
       corset top — which reads as a mistake rather than personalisation.

       This is the same photograph the ad used, so the click and the landing
       show the same garment. That is the version of the beat worth showing:
       not "the page changed", but "the page changed to the thing I clicked". */
    var img = document.getElementById('hero-img');
    if (img && copy.image && img.getAttribute('src') !== copy.image) {
      img.setAttribute('src', copy.image);
      img.setAttribute('alt', '');
    }

    /* Two destinations, deliberately.

       The BUTTON goes to the collection, because that is where the story
       continues — thirty-two coats, facets, variant grouping, add to cart,
       abandon. A product page is the tightest match to the ad but it is a dead
       end, and the next click has to go backwards.

       The IMAGE goes to the product, because the visitor recognises the exact
       coat from the ad and expecting to click it is reasonable. In the markup
       the hero image is not a link at all, so the campaign makes it one.

       A click handler rather than wrapping the element in an anchor: wrapping
       is DOM surgery inside a MutationObserver, which invites a feedback loop
       for no visible gain. */
    if (img && copy.product && !img.getAttribute('data-hero-linked')) {
      img.setAttribute('data-hero-linked', '1');
      img.style.cursor = 'pointer';
      img.addEventListener('click', function () { location.href = copy.product; });
    }
    return true;
  }

  /* TIMING — WHY AN OBSERVER AND NOT A TIMER.

     vertical.js writes the default per-vertical copy into these same elements
     on DOMContentLoaded, and on a storefront with a multi-megabyte catalogue
     that can land well after this campaign has run. A short retry window loses
     that race and the headline visibly reverts.

     So watch the element instead. Whenever something rewrites the hero to
     anything that is not ours, put ours back.

     It stops after five seconds, and stops immediately if affinity.js takes
     over — a hero driven by what the visitor has actually browsed should beat
     one driven by the ad they clicked, so this yields rather than fights. */
  function isOurs() {
    var t = document.querySelector('[data-hero-title]');
    if (!t || t.innerHTML !== copy.title) return false;
    var img = document.getElementById('hero-img');
    if (img && copy.image && img.getAttribute('src') !== copy.image) return false;
    return true;
  }

  function affinityHasRun() {
    var e = document.querySelector('[data-hero-eyebrow]');
    return !!e && /because you have been/i.test(e.textContent || '');
  }

  function note(msg) {
    if (window.insDebugNote) window.insDebugNote('hero campaign: ' + msg, 'ok');
    else if (window.console) console.log('[hero campaign] ' + msg);
  }

  var stopped = false;
  function stop(why) {
    if (stopped) return;
    stopped = true;
    if (observer) observer.disconnect();
    note('settled on ' + key + ' (' + why + ')');
  }

  var observer = null;
  function watch() {
    if (!window.MutationObserver) return;
    var host = document.querySelector('[data-hero-title]');
    if (!host || !host.parentNode) return;
    observer = new MutationObserver(function () {
      if (stopped) return;
      if (affinityHasRun()) return stop('affinity took over');
      if (!isOurs()) apply();
    });
    var opts = { childList: true, subtree: true, characterData: true };
    observer.observe(host.parentNode, opts);
    var img = document.getElementById('hero-img');
    if (img) observer.observe(img, { attributes: true, attributeFilter: ['src'] });
  }

  function start() {
    if (!apply()) return false;
    watch();
    setTimeout(function () { stop('timeout'); }, 5000);
    return true;
  }

  if (!start()) {
    // Hero not in the DOM yet — poll briefly for it, then give up quietly.
    var waits = 0;
    var wait = setInterval(function () {
      if (start() || ++waits > 120) clearInterval(wait);
    }, 25);
  }
  document.addEventListener('DOMContentLoaded', function () { if (!stopped) apply(); });
  window.addEventListener('load', function () { if (!stopped) apply(); });
})();
