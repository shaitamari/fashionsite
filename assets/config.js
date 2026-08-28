/* ============================================================================
   MERIDIAN — Insider One demo storefront
   Single source of truth for every account-specific setting.
   Change things here, not in the page templates.
   ========================================================================== */

window.SITE_CONFIG = {

  /* --- Insider Tag (InOne > Account Settings > Account Details) ------------ */
  partnerName: 'salesdemo',
  partnerId:   '10002548',
  // Resulting tag: //salesdemo.api.useinsider.com/ins.js?id=10002548

  /* --- Locale / currency -------------------------------------------------- */
  language: 'en_US',
  currency: 'USD',
  country:  'US',

  /* --- Eureka (Search & Merchandising) ------------------------------------
     SET THESE. Auto-discovery is attempted but is not reliable: the
     'eureka:sdk:campaign:ready' event does not reach a listener bound after
     the tag has initialised, which is always, because the tag loads async.

     To find a campaign id: open a search page, DevTools > Network, filter on
     `useinsider`, and look for a request containing `?pa=eureka&`. The
     response body starts with `campId`. It is also on the campaign's row in
     the panel, under the information icon.
     --------------------------------------------------------------------- */
  eureka: {
    enabled: true,
    searchCampaignId:   112,    // full-page search results  (search.html)
    listingCampaignId:  null,   // category listing pages    (category.html)
    pageSize: 24,
    defaultSorting: 'Relevancy',
    // Fall back to the local demo catalog when no campaign is live, when the
    // visitor lands in the control group, or when a fetch fails.
    fallbackToLocalCatalog: true
  },

  /* --- Smart Recommender (JavaScript SDK campaigns) -----------------------
     Each key maps a page surface to a Smart Recommender campaign ID.
     Find the ID via Smart Recommender > campaign row > information icon.

     Leave a value null and the surface will accept the first SDK campaign
     that fires on that page — convenient for demos, ambiguous if you run
     several campaigns at once.
     --------------------------------------------------------------------- */
  reco: {
    enabled: true,
    campaigns: {
      home:         null,   // #reco-home         on index.html
      product:      null,   // #reco-product      on product.html
      cart:         null,   // #reco-cart         on cart.html
      confirmation: null    // #reco-confirmation on confirmation.html
    }
  },

  /* --- Custom attributes & events -----------------------------------------
     These must exist in InOne > Attributes and Events before values will
     land on a profile. The names below are what this site sends.
     --------------------------------------------------------------------- */
  customAttributes: [
    'membership_tier',    // string   Bronze | Silver | Gold
    'loyalty_points',     // number
    'preferred_category', // string
    'signup_date',        // datetime (ISO 8601, e.g. 2026-08-28T00:00:00Z)
    'is_vip'              // boolean
  ],

  customEvents: [
    'site_search',        // search_term (string), results_count (number)
    'product_wishlisted', // product_id (string), product_name (string)
    'size_guide_opened',  // product_id (string)
    'newsletter_signup',  // source (string)
    'filter_applied'      // filter_name (string), filter_value (string)
  ],

  /* --- Telemetry console --------------------------------------------------
     The on-page panel that mirrors every InsiderQueue push.
     Append ?debug=0 to any URL to hide it for a clean screen share.
     --------------------------------------------------------------------- */
  debugPanel: {
    enabled: true,
    startOpen: false,
    mirrorToConsole: true
  }
};
