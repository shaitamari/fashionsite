/* ============================================================================
   Legacy insider_object shim
   ----------------------------------------------------------------------------
   WHY THIS EXISTS

   The Insider tag reads page data through:

       getInsiderObject = function () {
           return Insider.insiderObject || window.insider_object;
       }

   `Insider.insiderObject` is built by draining window.InsiderQueue — the Web
   SDK path. That path is gated on an account flag (`inioa` in the served
   ins.js). On partnersandbox (10006846) that flag is FALSE, so the queue is
   never consumed: pushes accumulate (InsiderQueue.length stays at 4) and
   `Insider.insiderObject` is undefined.

   The consequence is not obvious. Every system rule that reads the IO falls
   back to its hard-coded default, silently:

       getLang    -> getDataFromIO('user','language','en_US')  ->  en_US
       getLocale  -> derives from getLang                      ->  en_US
       getCurrency, isOnProductPage, getCurrentProduct, ...     ->  defaults

   Eureka then serves the en_US index rather than en_GB — wrong taxonomy,
   wrong prices, wrong product URLs — while the campaign, the catalog, the
   feed and the tag are all correctly configured. Nothing reports an error.

   THE FIX

   The tag's own fallback is `window.insider_object`, the legacy global, and
   with `inioa` false the tag takes the legacy path anyway. Setting that
   object directly makes every IO-based rule resolve correctly. No account
   flag, no permission, no panel change.

   This file must run SYNCHRONOUSLY in <head>, AFTER vertical.js (which sets
   window.ENVIRONMENT) and BEFORE ins.js loads. getLocale caches its result on
   first call, so the value has to exist before the tag first asks.

   REMOVING THIS

   Once Web SDK processing is enabled on the account (ask: enable InsiderQueue
   / new-IO init, `inioa`), `Insider.insiderObject` takes precedence over this
   global automatically and the shim becomes inert. It is safe to leave in
   place, but delete it once the queue path is confirmed working, so there is
   one source of truth for page data.
   ========================================================================== */
(function () {
  'use strict';

  var env = window.ENVIRONMENT || {};
  var locale = env.locale || 'en_GB';
  var currency = env.currency || 'EUR';

  // getLang splits on "_" and validates the country against its own list.
  // "en" permits GB, so en_GB passes through and getLocale returns it intact.
  var country = locale.split('_')[1] || 'GB';

  // Only the fields the system rules actually read. The full user profile
  // still goes through InsiderQueue in store.js — this is the minimum needed
  // to make locale, language and currency resolve correctly.
  window.insider_object = window.insider_object || {};

  window.insider_object.user = window.insider_object.user || {};
  window.insider_object.user.language = locale;
  window.insider_object.user.country = country;

  // getCurrency checks basket, then product, then transaction currency before
  // falling back to the account's preferred currency. Seeding basket covers
  // every page type without pretending there are items in the cart.
  window.insider_object.basket = window.insider_object.basket || {};
  if (window.insider_object.basket.currency == null) {
    window.insider_object.basket.currency = currency;
  }

  if (window.insDebugNote) {
    window.insDebugNote('insider_object seeded: ' + locale + ' / ' + currency, 'ok');
  }
})();
