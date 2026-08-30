/* ============================================================================
   The dare — a small provocation beside the search box
   ----------------------------------------------------------------------------
   Good search looks exactly like ordinary search. Variants collapse, results
   stay inside the store, the matching colourway wins — and a visitor sees none
   of it, because working software is invisible.

   A guide page was the obvious fix and the wrong one: nobody reads a manual on
   a storefront. A dare is better. It is one line, it is specific, it is a
   single click, and the payoff arrives on the results page rather than in
   prose. Someone clicking alone three days after a call gets the same moment
   an SC would have walked them through.

   Each dare is a query that proves something, plus a line explaining what just
   happened. That second line appears only AFTER the search runs — the point has
   to land on its own first, or it is a claim rather than a demonstration.
   ========================================================================== */
(function () {
  'use strict';

  /* One dare per vertical that actually proves something, and a payoff that
     says what to look at. Where a vertical has a genuine second act — a word to
     swap — the follow-up is usually the better half of the demo. */
  var DARES = {
    fashion: {
      q: 'Halden Solace burgundy',
      chip: 'Search \u201cHalden Solace burgundy\u201d. We dare you.',
      payoff: 'One dress, two colourways \u2014 and the platform picked the one your words ' +
              'described, not whichever ranked highest. Swap burgundy for zebra and watch ' +
              'it change.',
      next: { q: 'Halden Solace zebra', label: 'Now try zebra' }
    },
    beauty: {
      q: 'balm',
      chip: 'Search \u201cbalm\u201d. Count the cards, then count the shades.',
      payoff: 'Every shade and size sits on one card instead of taking a row each.'
    },
    airlines: {
      q: 'London to New York',
      chip: 'Search \u201cLondon to New York\u201d. We dare you.',
      payoff: 'One route, four cabins, one card \u2014 which is how a traveller thinks ' +
              'about it. Not four listings of the same flight.'
    },
    hotels: {
      q: 'suite',
      chip: 'Search \u201csuite\u201d. Watch the room types.',
      payoff: 'Rooms group under the property, so you compare hotels rather than every ' +
              'rate plan in the estate.'
    },
    home: {
      q: 'bed',
      chip: 'Search \u201cbed\u201d. Look at the fabric dots.',
      payoff: 'One bed in six fabrics reads as one product with six options, not six ' +
              'near-identical listings competing with each other.'
    },
    electronics: {
      q: 'speaker',
      chip: 'Search \u201cspeaker\u201d. Then try \u201cdress\u201d.',
      payoff: 'Capacities and finishes group under the model. Now try \u201cdress\u201d ' +
              '\u2014 nothing here matches, and it says so rather than quietly showing ' +
              'you something from another store.',
      next: { q: 'dress', label: 'Now try \u201cdress\u201d' }
    },
    luxury: {
      q: 'belt',
      chip: 'Search \u201cbelt\u201d. Note the sizes.',
      payoff: 'Sizings sit on the card rather than flooding the grid \u2014 which matters ' +
              'when the collection is small and every row is scrutinised.'
    },
    supermarket: {
      q: 'biscuits',
      chip: 'Search \u201cbiscuits\u201d. Look at the pack sizes.',
      payoff: 'Pack sizes group together, so you get brands to choose between rather than ' +
              'the same brand eight times.'
    },
    banking: {
      q: 'current account',
      chip: 'Search \u201ccurrent account\u201d. Check the tiers.',
      payoff: 'Tiers group under the product, so the choice on screen is which account ' +
              '\u2014 not which of five versions of one.'
    },
    insurance: {
      q: 'travel',
      chip: 'Search \u201ctravel\u201d. Look at the cover levels.',
      payoff: 'Cover levels group under the policy, keeping the comparison at the level ' +
              'someone is actually deciding at.'
    },
    fintech: {
      q: 'account',
      chip: 'Search \u201caccount\u201d. Check the plan tiers.',
      payoff: 'Plans group under the product rather than filling the grid with variants.'
    },
    telco: {
      q: 'plan',
      chip: 'Search \u201cplan\u201d. Look at the data tiers.',
      payoff: 'Data tiers and handset colours group under the plan, so the grid shows ' +
              'plans to choose between rather than every combination of the two.'
    }
  };

  function dareFor() { return DARES[window.VERTICAL_KEY] || null; }

  function currentQuery() {
    return (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase();
  }

  /* --- the chip, beside the search box ------------------------------------ */
  function buildChip(d) {
    var box = document.querySelector('form[data-search]');
    if (!box || document.querySelector('.dare')) return;

    var a = document.createElement('a');
    a.className = 'dare';
    a.href = 'search.html?q=' + encodeURIComponent(d.q);
    a.appendChild(document.createTextNode(d.chip));

    var arrow = document.createElement('span');
    arrow.className = 'dare__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2192';
    a.appendChild(arrow);

    /* The masthead is `grid-template-columns: auto 1fr auto` — brand, search,
       utils. Inserting a fourth child pushes it onto an implicit second row
       under the BRAND, where it reads as stray text. So place it explicitly in
       the search column of that second row, directly beneath the input. */
    var bar = box.parentNode;
    if (bar && getComputedStyle(bar).display === 'grid') {
      /* The search box is `max-width: 520px; justify-self: center`, so it sits
         centred in a much wider column. Aligning the dare to the column's start
         leaves it floating well left of the input. Mirror the box instead —
         same width, same centring — then left-align the text inside it, so the
         dare lines up with where the input actually begins. */
      var cs = getComputedStyle(box);
      a.style.gridColumn = '2';
      a.style.justifySelf = cs.justifySelf || 'center';
      a.style.maxWidth = cs.maxWidth;
      a.style.width = '100%';
      a.style.marginLeft = '0';
      a.style.marginTop = '.45rem';
      bar.appendChild(a);
    } else {
      box.insertAdjacentElement('afterend', a);
    }
  }

  /* --- the payoff, on the results page ------------------------------------
     Only once the search has run. Showing the explanation first would make it a
     claim; showing it second makes it a caption on something already seen. */
  function buildPayoff(d) {
    var q = currentQuery();
    if (!q) return;
    var isDare = q === String(d.q).toLowerCase();
    var isNext = !!(d.next && q === String(d.next.q).toLowerCase());
    if (!isDare && !isNext) return;

    var host = document.querySelector('.toolbar');
    if (!host) return;

    var box = document.createElement('div');
    box.className = 'dare__payoff';

    var p = document.createElement('p');
    p.className = 'dare__payoff-text';
    p.textContent = d.payoff;
    box.appendChild(p);

    // The second act, where there is one.
    if (isDare && d.next) {
      var n = document.createElement('a');
      n.className = 'dare__next';
      n.href = 'search.html?q=' + encodeURIComponent(d.next.q);
      n.textContent = d.next.label + ' \u2192';
      box.appendChild(n);
    }

    host.insertAdjacentElement('beforebegin', box);
  }

  var STYLE = '' +
    '.dare{display:flex;align-items:center;justify-content:flex-start;gap:.4rem;' +
      'font-size:.8125rem;color:var(--muted,#888);text-decoration:none;' +
      'white-space:nowrap;transition:color .15s}' +
    '.dare:hover{color:var(--accent,#333)}' +
    '.masthead__in{row-gap:0}' +
    '.dare__arrow{transition:transform .15s}' +
    '.dare:hover .dare__arrow{transform:translateX(2px)}' +
    '@media (max-width:900px){.dare{display:none}}' +
    '.dare__payoff{margin:1.25rem 0 .25rem;padding:.9rem 1.1rem;' +
      'border-left:3px solid var(--accent,#999);background:var(--alt,#fafafa)}' +
    '.dare__payoff-text{margin:0;font-size:.875rem;line-height:1.6;color:var(--ink,#333)}' +
    '.dare__next{display:inline-block;margin-top:.55rem;font-size:.8125rem;' +
      'color:var(--accent,#333);text-decoration:none;border-bottom:1px solid currentColor;' +
      'padding-bottom:1px}';

  document.addEventListener('DOMContentLoaded', function () {
    if ((window.SITE_CONFIG || {}).dares === false) return;
    var d = dareFor();
    if (!d) return;
    var s = document.createElement('style');
    s.textContent = STYLE;
    document.head.appendChild(s);
    buildChip(d);
    buildPayoff(d);
  });
})();
