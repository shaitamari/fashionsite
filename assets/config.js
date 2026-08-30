/* ============================================================================
   Insider One demo storefront — shared configuration
   ----------------------------------------------------------------------------
   Settings that are the SAME for every vertical live here.

   Settings that DIFFER per vertical — brand name, account, locale, currency,
   UX labels, catalogue — are resolved from the hostname by assets/vertical.js.
   They are deliberately not repeated here: this file previously carried a
   stale copy (onesandbox / en_US / USD) that contradicted the account the
   site was actually served from.
   ========================================================================== */

window.SITE_CONFIG = {

  /* --- Eureka (Search & Merchandising) ------------------------------------
     Campaign ids are per ACCOUNT, and the account is chosen by hostname, so
     they must not be hard-coded globally. A single `searchCampaignId: 112`
     meant every vertical queried campaign 112 on salesdemo no matter which
     subdomain served it — which is why beauty.insiderdemo.com returned the
     salesdemo catalogue with unusable field names.

     Leave these null. eureka.js discovers the campaign the panel is serving
     on the current page, which is correct per account by construction.

     Only set an id to disambiguate when several Eureka SDK campaigns run on
     the same page at once. If you do, it is account-specific — key it under
     `perAccount` below rather than setting it globally.

     partnersandbox is set explicitly, and needs to be. Two Eureka campaigns
     are live on that account — the JavaScript SDK campaign that drives
     search.html, and an Instant Search pop-up bound to #searchinput. The
     discovery in eureka.js reads the campaign pool the tag exposes and takes
     the first id it finds, without filtering by campaign type. With two
     campaigns live it can hand fetch.search() the pop-up's id, which is not
     an SDK campaign and returns nothing — and because an id *was* found, the
     "no campaign" diagnostic never fires. Naming the id removes the ambiguity.

     To find a campaign id: Campaigns > Search and Merchandising > Eureka, the
     campaign's row, information icon. Or: search page > DevTools > Network >
     filter `useinsider` > request containing `?pa=eureka&`; the response body
     starts with `campId`. Prefer the panel — it tells you which campaign is
     which, and the network view does not.
     --------------------------------------------------------------------- */
  eureka: {
    enabled: true,

    searchCampaignId:  null,   // auto-discover unless overridden below
    listingCampaignId: null,   // auto-discover

    // Keyed by the account name vertical.js resolves from the hostname.
    // Anything set here wins over the nulls above.
    perAccount: {
      partnersandbox: {
        searchCampaignId:  4233,   // JavaScript SDK campaign, en_GB
        listingCampaignId: 4235    // category pages, en_GB
      }
      // salesdemo: { searchCampaignId: null, listingCampaignId: null },
    },

    pageSize: 24,
    defaultSorting: 'Relevancy',

    // Fall back to the local demo catalogue when no campaign is live, when
    // the visitor lands in the control group, or when a fetch fails.
    fallbackToLocalCatalog: true
  },

  /* --- Smart Recommender (JavaScript SDK campaigns) -----------------------
     Same rule: null means "accept the first SDK campaign that fires on this
     surface", which is what you want while there is one campaign per page.
     Use perAccount only once several recommenders run on the same page.

     CAMPAIGN IDS ARE PER ACCOUNT. They are assigned at creation and do not
     travel: rebuilding these campaigns on another account produces different
     ids, and the ones below will silently match nothing there. So every id
     lives under `perAccount`, keyed by the account vertical.js resolves from
     the hostname, and never at the top level.
     --------------------------------------------------------------------- */
  reco: {
    enabled: true,

    /* Name the strategy on the widget.

       Academy's own overview says the recommendation process "appears as a
       black box, with its workings remaining unclear". In a demo that is the
       whole problem: a grid of products proves nothing, because a prospect
       cannot tell personalisation from a static list. Saying which algorithm
       produced the row, and what it reads, turns the widget into an argument.

       Set showStrategy false to hide the strip without removing the config. */
    showStrategy: true,

    /* The algorithms, grouped as Academy groups them. `needs` is the honest
       part — several of these are cold on a fresh account, and it is better to
       say so on screen than to show an empty row and hope nobody asks. */
    strategies: {
      similar: {
        label: 'Similar products',
        group: 'AI similarity',
        icon: 'similar',
        blurb: 'Reads product descriptions and attributes to find items like the one being viewed.',
        needs: 'Catalogue only — works from day one, including for new products.',
        where: 'Large, well-described catalogues. It reads the words you already wrote, so it covers the long tail rather than only the bestsellers.',
        pairs: 'Viewed together. Text says what a product is like; behaviour confirms which of those a shopper actually treats as alternatives.',
        caveat: 'Only as good as your product copy. Thin descriptions give thin results.',
        placement: 'Product page, first. Industry guidance is that if you can only run one recommendation unit anywhere, make it Similar Products on the PDP.'
      },
      visually_similar: {
        label: 'Visually similar',
        group: 'AI similarity',
        icon: 'image',
        blurb: 'Compares product images with a multimodal model — colour, shape, texture, style.',
        needs: 'A valid image_url on each product. No behavioural data required.',
        where: 'Apparel, furniture, jewellery, home decor — anywhere the look drives the decision. Fits how people actually shop these categories.',
        pairs: 'Complementary. One finds the alternative, the other finds what goes with it.',
        caveat: 'Image quality decides relevance. Clean, consistent shots on a plain background work best; busy lifestyle imagery works less well.',
        placement: 'Product page and add-to-cart. Especially valuable when an item is out of stock in the shopper\u2019s size \u2014 it offers an alternative instead of a dead end.'
      },
      complementary: {
        label: 'Complementary',
        group: 'AI similarity',
        icon: 'complementary',
        blurb: 'Cross-sell chosen by AI category reasoning rather than co-purchase counts.',
        needs: 'Catalogue only.',
        where: 'The cart and the confirmation page, where the question is what goes with this rather than what is like it.',
        pairs: 'Similar or Visually similar on the product page, Complementary at the cart.',
        caveat: 'It reasons about categories rather than observing real baskets, so it will not find the odd pairing your customers actually make.',
        placement: 'Cart and checkout. Last-minute add-ons at the cart are among the highest-converting placements there are.'
      },
      viewed_together: {
        label: 'Viewed together',
        group: 'Behavioural',
        icon: 'together',
        blurb: 'Products explored in the same sessions as this one, in this locale.',
        needs: 'Session traffic. Cold on a new account.',
        where: 'High-traffic catalogues where sessions are long enough to reveal genuine consideration sets.',
        pairs: 'Similar, which covers the products behaviour has not reached yet.',
        caveat: 'Needs session volume. Cold on a new account and on newly added products.',
        placement: 'Product page, alongside Similar.'
      },
      purchased_together: {
        label: 'Purchased together',
        group: 'Behavioural',
        icon: 'cart',
        blurb: 'Items frequently bought alongside this one, ranked by purchase frequency.',
        needs: 'Purchase history. Cold on a new account.',
        where: 'Grocery, consumables, accessories — anywhere real baskets contain several items.',
        pairs: 'Complementary, which fills the gap for products with no purchase history.',
        caveat: 'Needs purchase volume, and reflects what people already buy together rather than what they might.',
        placement: 'Cart. The classic AOV placement.'
      },
      purchased_with_last: {
        label: 'Purchased with last purchased',
        group: 'Personalised',
        icon: 'user',
        blurb: 'Bought alongside the visitor\u2019s own most recent purchase.',
        needs: 'A known visitor with a purchase behind them.',
        fallback: 'Silent for anyone who has not purchased. Pair it with a generic ' +
                  'strategy beneath.',
        where: 'Repeat-purchase categories, and returning customers with a history.',
        pairs: 'User based, for the visitors who browse more than they buy.',
        caveat: 'Silent for anyone who has not bought yet, which is most first-time visitors.',
        placement: 'Homepage and account pages for returning customers.'
      },
      user_based: {
        label: 'User based',
        group: 'Personalised',
        icon: 'user',
        blurb: 'Built from this visitor\u2019s own views, add-to-carts and purchases.',
        needs: 'Browsing history for this visitor.',
        /* Documented behaviour: a visitor with no history \u2014 first session,
           or incognito, where a fresh UserID is generated \u2014 falls back to a
           performance-based strategy, in practice Most Popular. The payload
           does not say when this happens, so it cannot be detected at runtime.
           Naming it on the strip is the honest option, and it is also the
           better demo point: it degrades to something sensible rather than
           rendering an empty row. */
        fallback: 'Most popular, for anyone with no history yet \u2014 including ' +
                  'incognito sessions, which generate a fresh visitor id.',
        where: 'Returning visitors and logged-in customers.',
        pairs: 'A generic strategy as the fallback, for visitors with no history.',
        caveat: 'Needs history for this specific visitor. Nothing to say to a first-time anonymous session.',
        placement: 'Homepage for returning visitors \u2014 pick up where they left off.'
      },
      top_sellers: {
        label: 'Top sellers',
        group: 'Generic',
        icon: 'trend',
        blurb: 'Best-selling products over the lookback period. Same row for everyone.',
        needs: 'Purchase data.',
        where: 'Homepages and cold starts, where nothing is known about the visitor.',
        pairs: 'Anything personalised, as the fallback beneath it.',
        caveat: 'The same row for everyone. Reliable, not personal — and it reinforces what already sells rather than surfacing the rest.',
        placement: 'Homepage, for first-time visitors with no history.'
      },
      most_popular: {
        label: 'Most popular',
        group: 'Generic',
        icon: 'trend',
        blurb: 'Ranked by total page views over the lookback period.',
        needs: 'Page-view traffic.',
        where: 'Homepages, and categories where views are a better signal than sales.',
        pairs: 'Similar, to open up the catalogue beyond the popular few.',
        caveat: 'Views are not intent. Popular is not the same as likely to convert.',
        placement: 'Homepage and category pages, for new visitors.'
      },
      trending: {
        label: 'Trending',
        group: 'Generic',
        icon: 'trend',
        blurb: 'Products gaining interest fastest right now.',
        needs: 'Recent traffic.',
        where: 'Fast-moving catalogues — fashion drops, seasonal, news-driven demand.',
        pairs: 'New arrivals.',
        caveat: 'Short lookback makes it volatile, and it amplifies whatever is already moving.',
        placement: 'Homepage, and category pages in fast-moving ranges.'
      },
      new_arrivals: {
        label: 'New arrivals',
        group: 'Generic',
        icon: 'new',
        blurb: 'Newest items, by when they entered the catalogue feed.',
        needs: 'Catalogue only.',
        where: 'Fashion and any catalogue with a drop cadence, where newness is itself the reason to look.',
        pairs: 'Visually similar, so a new product is reachable the day it lands.',
        caveat: 'Recency is not relevance. It says nothing about whether this visitor wants it.',
        placement: 'Homepage and category landing pages.'
      },
      highest_discounted: {
        label: 'Highest discounted',
        group: 'Generic',
        icon: 'tag',
        blurb: 'Largest markdown against original price.',
        needs: 'Catalogue only.',
        where: 'Sale periods and clearance.',
        pairs: 'Anything, as a secondary row rather than the main one.',
        caveat: 'Trains people to wait for markdowns, and can cannibalise full-price sales.',
        placement: 'Sale landing pages and a secondary row elsewhere.'
      },
      most_valuable: {
        label: 'Most valuable',
        group: 'Generic',
        icon: 'trend',
        blurb: 'Highest revenue contribution over the lookback period.',
        needs: 'Purchase data.',
        where: 'Where margin matters more than conversion rate.',
        pairs: 'A relevance-driven strategy above it.',
        caveat: 'Optimises for your revenue rather than the shopper, so it needs watching.',
        placement: 'Category pages, where a nudge toward margin is defensible.'
      },
      auto_optimized: {
        label: 'Auto-optimised',
        group: 'Personalised',
        icon: 'auto',
        blurb: 'Picks the best-performing algorithm per context automatically.',
        needs: 'About two months of traffic before it can choose.',
        where: 'Established accounts with enough history for the model to compare algorithms.',
        pairs: 'Nothing — it is the thing choosing.',
        caveat: 'Needs roughly two months of traffic before it can pick anything.',
        placement: 'Discovery surfaces \u2014 homepage, category, search \u2014 where there is no single obviously right answer.'
      }
    },

    /* One slot per surface. The strategy is per SLOT, not per account: four
       widgets on four pages are four campaigns with four different algorithms,
       and the strip has to name the right one.

       `strategy` must match a key in `strategies` above, and must match what
       was actually chosen in the panel — nothing verifies this, because the
       tag does not report the algorithm back. */
    campaigns: {
      home:         null,   // #reco-home         on index.html
      product:      null,   // #reco-product      on product.html
      cart:         null,   // #reco-cart         on cart.html
      confirmation: null    // #reco-confirmation on confirmation.html
    },

    perAccount: {
      partnersandbox: {
        // PDP - Similar Products. en_GB, page rule "Page Type is Product
        // Page", source "currently viewed item on page".
        //
        // Three ids, and they are all different:
        //   campaignId       4236   the campaign, for logging + attribution
        //   variationId      8850   what Insider.campaign.get() is keyed on
        //   recommendationId 43622  the strategy inside the variation
        //
        // recs.js listens for `ins-sr:only-api-campaign:load` rather than
        // fetching, so only the first two are used. 43622 is recorded here
        // because nothing else writes it down and it is the next thing to try
        // if the variation lookup ever stops resolving.
        // Kept for reference; `slots` below is what the code reads.
        campaignId: 4236,
        variationId: 8850,
        recommendationId: 43622,
        strategy: 'similar',

        /* Per-surface campaigns. Fill each in as it is built in the panel.
           A slot with no `strategy` renders products but no strip; a slot
           that does not exist here simply renders nothing extra. */
        slots: {
          product: {
            campaignId: 4236,
            variationId: 8850,
            recommendationId: 43622,
            strategy: 'similar'
          },
          /* Two rows on the homepage. The upper one switches by segment \u2014
             New arrivals for high tier, Highest discounted for discount-led,
             Top sellers for unknown visitors. The lower one is User based,
             placed at the foot of the page where retailers conventionally put
             it, which also means an empty row is survivable rather than the
             first thing anyone sees. */
          home:         { campaignId: null, variationId: null, strategy: 'new_arrivals' },
          homeFoot:     { campaignId: null, variationId: null, strategy: 'user_based' },
          cart:         { campaignId: null, variationId: null, strategy: 'complementary' },
          confirmation: { campaignId: null, variationId: null, strategy: 'visually_similar' }
        },

        /* Per-vertical overrides.

           A dynamic filter on `category` lets ONE campaign scope itself across
           all twelve verticals, because the vertical is the top level of the
           category path. That collapses twelve campaigns into one — but only
           where the ALGORITHM should be the same everywhere, and it should not.

           Similar products on a savings account returns other savings accounts,
           which is the bank competing with itself; Complementary is the right
           call, because in financial services the useful recommendation is what
           the customer does not hold yet. Travel is different again: people
           shop hotels by assembling a consideration set, so Viewed together
           matches the actual decision better than similarity by description.

           So: one campaign per DISTINCT STRATEGY, scoped by dynamic filter,
           rather than one per vertical or one for everything. A vertical listed
           here uses its own campaign; anything absent falls through to `slots`.

           Note which of these are cold on a fresh account. Viewed together
           needs session volume, so the travel entries are the right long-term
           answer and will return nothing today. Left here as intent, with the
           ids null so nothing renders half-working. */
        perVertical: {
          banking:   { cart:    { campaignId: null, variationId: null, strategy: 'complementary' },
                       product: { campaignId: null, variationId: null, strategy: 'complementary' } },
          insurance: { product: { campaignId: null, variationId: null, strategy: 'complementary' } },
          fintech:   { product: { campaignId: null, variationId: null, strategy: 'complementary' } },

          // Right answer, needs traffic. Ids stay null until the account is warm.
          hotels:    { product: { campaignId: null, variationId: null, strategy: 'viewed_together' } },
          airlines:  { product: { campaignId: null, variationId: null, strategy: 'viewed_together' } },

          // Visual verticals: the look is the decision.
          fashion:   { confirmation: { campaignId: null, variationId: null, strategy: 'visually_similar' } },
          luxury:    { product:      { campaignId: null, variationId: null, strategy: 'visually_similar' } },
          home:      { product:      { campaignId: null, variationId: null, strategy: 'visually_similar' } }
        }
      }
      // salesdemo: { campaignId: null, variationId: null },
    }
  },

  /* --- Custom attributes & events -----------------------------------------
     These must exist in InOne > Attributes and Events before values land on a
     profile. A mismatched name or type is dropped silently on a 200 — no
     error anywhere.

     NOTE: the account is at roughly 70 of its 80 custom-attribute cap, so
     `service_preference` could not be created and an existing attribute was
     repurposed. The name and type below must match that attribute exactly,
     or every flow.html submission is silently discarded.
     --------------------------------------------------------------------- */
  customAttributes: [
    'membership_tier',     // string   Bronze | Silver | Gold
    'loyalty_points',      // number
    'preferred_category',  // string
    'signup_date',         // datetime (ISO 8601)
    'is_vip',              // boolean
    'service_preference'   // string   VERIFY against the reused attribute
  ],

  customEvents: [
    'site_search',         // search_term (string), results_count (number)
    'product_wishlisted',  // product_id (string), product_name (string)
    'size_guide_opened',   // product_id (string)
    'newsletter_signup',   // source (string)
    'filter_applied'       // filter_name (string), filter_value (string)
  ],

  /* --- Telemetry console --------------------------------------------------
     On-page panel mirroring every InsiderQueue push.
     Append ?debug=0 to any URL to hide it for a clean screen share.
     --------------------------------------------------------------------- */
  debugPanel: {
    enabled: true,
    startOpen: false,
    mirrorToConsole: true
  }
};

/* ----------------------------------------------------------------------------
   Apply per-account overrides once vertical.js has resolved the environment.

   vertical.js runs first (it writes the tag and the catalog at parse time), so
   window.ENVIRONMENT normally exists by the time this file executes. The poll
   below removes the dependency on that ordering anyway: if the environment is
   not there yet, keep looking briefly rather than silently skipping the
   override and querying the wrong campaign.
   -------------------------------------------------------------------------- */
(function () {
  // vertical.js puts account / partnerId / locale / currency on
  // window.ENVIRONMENT. window.VERTICAL is the catalog object, not this.
  function currentAccount() {
    return (window.ENVIRONMENT && window.ENVIRONMENT.account) || null;
  }

  function apply() {
    var acct = currentAccount();
    if (!acct) return false;

    ['eureka', 'reco'].forEach(function (section) {
      var cfg = window.SITE_CONFIG[section];
      var over = cfg && cfg.perAccount && cfg.perAccount[acct];
      if (!over) return;
      Object.keys(over).forEach(function (k) {
        // reco carries two kinds of key: per-surface campaign ids, which
        // belong in `campaigns`, and the campaign/variation pair for the
        // single active recommender, which belongs on the section itself.
        if (section === 'reco' && cfg.campaigns &&
            Object.prototype.hasOwnProperty.call(cfg.campaigns, k)) {
          cfg.campaigns[k] = over[k];
        } else {
          cfg[k] = over[k];
        }
      });
    });

    if (window.insDebugNote) {
      window.insDebugNote('Config resolved for account ' + acct, 'ok');
    }
    return true;
  }

  if (!apply()) {
    var tries = 0;
    var t = setInterval(function () {
      if (apply() || ++tries > 100) clearInterval(t);
    }, 20);
    document.addEventListener('DOMContentLoaded', apply);
  }
})();
