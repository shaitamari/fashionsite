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

     To find a campaign id: search page > DevTools > Network > filter
     `useinsider` > request containing `?pa=eureka&`. The response body starts
     with `campId`. Also on the campaign row in the panel, information icon.
     --------------------------------------------------------------------- */
  eureka: {
    enabled: true,

    searchCampaignId:  null,   // auto-discover
    listingCampaignId: null,   // auto-discover

    // Optional overrides, keyed by the partner name vertical.js resolves.
    // Anything found here wins over the nulls above.
    perAccount: {
      // salesdemo:      { searchCampaignId: 112, listingCampaignId: null },
      // partnersandbox: { searchCampaignId: null, listingCampaignId: null }
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
     --------------------------------------------------------------------- */
  reco: {
    enabled: true,
    campaigns: {
      home:         null,   // #reco-home         on index.html
      product:      null,   // #reco-product      on product.html
      cart:         null,   // #reco-cart         on cart.html
      confirmation: null    // #reco-confirmation on confirmation.html
    },
    perAccount: {
      // partnersandbox: { home: 123, product: 124 }
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
   Resolve per-account overrides once vertical.js has decided the account.
   Safe to run before or after vertical.js loads: it re-runs on DOM ready.
   -------------------------------------------------------------------------- */
(function () {
  // vertical.js puts account / partnerId / locale / currency on
  // window.ENVIRONMENT. window.VERTICAL is the catalog object, not this.
  function currentAccount() {
    return (window.ENVIRONMENT && window.ENVIRONMENT.account) || null;
  }

  function apply() {
    var acct = currentAccount();
    if (!acct) return;
    ['eureka', 'reco'].forEach(function (section) {
      var cfg = window.SITE_CONFIG[section];
      var over = cfg && cfg.perAccount && cfg.perAccount[acct];
      if (!over) return;
      Object.keys(over).forEach(function (k) {
        if (section === 'reco') cfg.campaigns[k] = over[k];
        else cfg[k] = over[k];
      });
    });
  }

  apply();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  }
})();
