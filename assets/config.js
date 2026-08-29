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
        // The VARIATION id is what Insider.campaign.get() is keyed on — 8850,
        // not 4236. The campaign id is for logging and attribution. Getting
        // these the wrong way round returns undefined with no error.
        campaignId: 4236,
        variationId: 8850
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
