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
     Campaign IDs are discovered automatically from the
     'eureka:sdk:campaign:ready' event, so you normally leave these null.

     Set them only if you run MORE THAN ONE SDK campaign on the same page and
     need to disambiguate which campaign drives which surface.
     --------------------------------------------------------------------- */
  eureka: {
    enabled: true,
    searchCampaignId:   null,   // full-page search results  (search.html)
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
