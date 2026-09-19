#!/usr/bin/env python3
"""Per-vertical Eureka campaign ids, so a storefront on its own locale can
point at its own campaign.

    python3 patch-eureka-pervertical.py

Campaign ids were keyed by ACCOUNT alone, which was right while every
storefront on an account shared one locale. Canon now runs on en_CA with its
own index, so it needs its own campaign — and the en_GB ids (4233 search,
4235 listing) must not reach it.

This adds a `perVertical` layer to the eureka config, resolved after
`perAccount`, so the order is: global default, then the account's ids, then
the storefront's own. The reco section already works this way.

It also accepts a single `campaignId` as shorthand: one JavaScript SDK
campaign can serve both search and category listing, so where one id covers
both there is no need to write it twice.

    perVertical: {
      canon: { campaignId: 4433 }          // one campaign, both surfaces
      // or: { searchCampaignId: 4433, listingCampaignId: 4434 }
    }

Fill the id in after creating the campaign on en_CA; until then Canon falls
back to the local catalogue, which is what the storefront is doing now.
"""
import os
import re
import sys

BLOCK = '''    // Keyed by the storefront (the vertical key), resolved AFTER perAccount.
    // A storefront on its own locale needs its own campaign: the en_GB ids
    // above index a different catalogue and would return nothing here.
    //
    // `campaignId` is shorthand for both surfaces — one JavaScript SDK
    // campaign can serve search and category listing together, which is how
    // Canon is set up. Use the two explicit keys only when they differ.
    perVertical: {
      // canon: { campaignId: null }   // en_CA — fill in once created
    },

'''

RESOLVE_OLD = '''    ['eureka', 'reco'].forEach(function (section) {
      var cfg = window.SITE_CONFIG[section];
      var over = cfg && cfg.perAccount && cfg.perAccount[acct];
      if (!over) return;
      Object.keys(over).forEach(function (k) {'''

RESOLVE_NEW = '''    var vert = (window.VERTICAL && window.VERTICAL.key) || null;

    // One JavaScript SDK campaign can serve both search and category
    // listing, so `campaignId` is shorthand for both. Expanded per layer,
    // before merging, so a storefront's shorthand overrides the account's
    // explicit ids rather than losing to them.
    function expand(o) {
      if (!o) return {};
      var out = Object.assign({}, o);
      if (out.campaignId) {
        if (out.searchCampaignId === undefined) out.searchCampaignId = out.campaignId;
        if (out.listingCampaignId === undefined) out.listingCampaignId = out.campaignId;
        delete out.campaignId;
      }
      return out;
    }

    ['eureka', 'reco'].forEach(function (section) {
      var cfg = window.SITE_CONFIG[section];
      if (!cfg) return;
      // The account's ids first, then the storefront's own on top: a
      // storefront on its own locale overrides whatever the account says.
      var over = Object.assign({},
        expand(cfg.perAccount && cfg.perAccount[acct]),
        expand(vert && cfg.perVertical && cfg.perVertical[vert]));
      if (!Object.keys(over).length) return;
      Object.keys(over).forEach(function (k) {'''

def main():
    path = "assets/config.js"
    if not os.path.exists(path):
        sys.exit("Run this from the repo root (no assets/config.js here).")
    s = open(path).read()
    done = []

    if "perVertical" not in s.split("/* --- Smart Recommender")[0]:
        anchor = re.search(r"( *)// salesdemo: \{ searchCampaignId: null, listingCampaignId: null \},\n( *)\},\n", s)
        if not anchor:
            sys.exit("config.js: could not find the eureka perAccount block to insert after.")
        s = s[:anchor.end()] + "\n" + BLOCK + s[anchor.end():]
        done.append("eureka.perVertical added")

    if "perVertical && cfg.perVertical" not in s:
        if RESOLVE_OLD not in s:
            sys.exit("config.js: the resolver has changed — add the perVertical merge by hand.")
        s = s.replace(RESOLVE_OLD, RESOLVE_NEW, 1)
        done.append("resolver reads perVertical after perAccount, and campaignId shorthand")

    open(path, "w").write(s)
    for d in done:
        print("  " + d)
    if not done:
        print("  nothing to do — already patched")
    print("\nThen set the id: eureka.perVertical.canon = { campaignId: <the en_CA campaign> }")


if __name__ == "__main__":
    print("Per-vertical Eureka campaigns")
    main()
