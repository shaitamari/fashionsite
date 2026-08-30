/* agent.js — Agent One on the storefront, via the MindBehind Web Messenger.
   ---------------------------------------------------------------------------

   WHAT THIS IS

   Agent One is configured in InOne, but it does not reach a website on its
   own. The path is:

       InOne > Agent One > AI Agents        the agent itself
       MindBehind Flow > Assistants         a flow with the
                                            "Use Shopping AI Agent (LLM)" module
       MindBehind Flow > Channels           a Web Messenger channel
       -> a channel id, which is what this file needs

   The channel id is the only thing that travels from MindBehind to here.
   Everything else — personality, knowledge base, actions, which InOne agent
   the flow points at — lives in the two panels.

   HOW IT IS WIRED

   Twelve storefronts share one codebase and one account, so there is one
   channel id per vertical, resolved the same way `searchCampaignId` is: by
   the vertical key vertical.js writes to window.VERTICAL_KEY.

   The map starts empty. A vertical with no channel id loads nothing at all —
   no script tag, no network call, no DOM node. So this can go live with one
   vertical filled in and the other eleven untouched.

   OFF BY DEFAULT IS DELIBERATE. Until CHANNELS below has an entry, adding
   the script tag to the pages changes nothing anywhere.

   TESTING WITHOUT A DEPLOY

       ?agent=<channelId>   run any channel on any storefront, right now
       ?agent=off           kill it for this page load
       ?agent-api=test      load the SDK against MindBehind's test API

   The URL override is the useful one while the agent is still being built:
   a channel can be pointed at fashion, then at hotels, then at telco,
   without a push in between.

   MindBehind also has a standalone harness that skips the site entirely:

       https://app.mindbehind.com/chatbot-test?channelId=<channelId>

   ISOLATION

   Same rule as affinity.js. Own namespace, one injected script tag, no
   runtime wrappers around anything else, nothing imported by another file.
   Remove the script tag from the pages and the estate is exactly as it was.
   -------------------------------------------------------------------------- */
(function () {
  'use strict';

  /* --- channel ids ---------------------------------------------------------
     One MindBehind Web Messenger channel per vertical.

     These sit here rather than in config.js on purpose, for now. config.js
     holds campaign ids that several files read; a channel id is read by this
     file and nothing else. When the agent stops being an experiment it should
     move to config.js under `agent.perAccount.partnersandbox`, alongside the
     Eureka and reco ids, and the applier's ['eureka','reco'] list gains
     'agent'. Not before — a config section that only one optional file reads
     is a config section that goes stale.

     DEFAULT is the fallback for any vertical without its own entry. While
     there is a single channel, put it there and every storefront gets the
     same agent; that is wrong for a real demo but right for finding out
     whether the thing renders. Once there are twelve, DEFAULT goes to null so
     a missing id fails visibly rather than silently serving the wrong brand.
     -------------------------------------------------------------------------- */
  var DEFAULT = null;      // <- one channel id here gets the widget on all twelve

  var CHANNELS = {
    beauty:      null,     // Lumen
    fashion:     null,     // Ashford Lane
    electronics: null,     // Kestrel
    home:        null,     // Aldgate
    luxury:      null,     // Beaumont Vale
    supermarket: null,     // Harvest Row
    telco:       null,     // Vantis
    hotels:      null,     // Wayfarer
    airlines:    null,     // Meridian Air
    banking:     null,     // Northbank
    insurance:   null,     // Fairhaven
    fintech:     null      // Loop
  };

  /* Layout flags, applied to `window` before the SDK loads because that is
     when it reads them. All optional; the defaults are the SDK's own.

       fullScreen        open the messenger full screen rather than as a panel
       hideHeader        drop the messenger's own header bar
       openOnLoad        open the panel without waiting for a click
       hideIcon          hide the floating button entirely
       disableIconClick  leave the button visible but inert

     hideIcon is for triggering the widget from your own UI. Nothing here does
     that yet, so leaving it false keeps the launcher as the way in. */
  var OPTIONS = {
    fullScreen: false,
    hideHeader: false,
    openOnLoad: false,
    hideIcon: false,
    disableIconClick: false
  };

  var SDK = 'https://cdn.mindbehind.com/sdk/mindbehind-sdk.js';
  var MOUNT_ID = 'MB_WEBCHAT_WIDGET';   // the node the SDK creates
  var TAG_ID = 'ins-agent-sdk';         // the script tag this file creates

  /* --- helpers ------------------------------------------------------------ */
  function note(msg, level) {
    // Every line is prefixed, so a MindBehind problem is never mistaken for an
    // Insider One one. They are two platforms and two support paths.
    if (window.insDebugNote) window.insDebugNote('agent (mindbehind): ' + msg, level || 'info');
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* Resolution order: URL override, then this vertical, then DEFAULT.
     Returns null when there is nothing to load, which is the normal state
     for a vertical whose agent has not been built yet. */
  function channelId() {
    var override = param('agent');
    if (override) {
      if (override === 'off' || override === '0' || override === 'false') return null;
      note('channel ' + override + ' from ?agent= override', 'warn');
      return override;
    }
    if (param('agent') === '' ) return null;

    var key = window.VERTICAL_KEY;
    if (!key) return null;
    return CHANNELS[key] || DEFAULT || null;
  }

  /* --- load --------------------------------------------------------------- */
  function load() {
    if (document.getElementById(TAG_ID)) return true;   // already injected
    if (document.getElementById(MOUNT_ID)) return true;  // already mounted

    var id = channelId();
    if (!id) return true;   // nothing configured for this vertical — done, silently

    if (param('agent') === 'off') { note('disabled for this page load', 'warn'); return true; }

    // Layout flags must be on window BEFORE the script runs.
    if (OPTIONS.fullScreen)       window.mbIsFullScreen = true;
    if (OPTIONS.hideHeader)       window.mbHideHeader = true;
    if (OPTIONS.openOnLoad)       window.mbWidget = true;
    if (OPTIONS.hideIcon)         window.mbHideIcon = true;
    if (OPTIONS.disableIconClick) window.mbOnclickDisabled = true;

    var src = SDK + '?auto=true&key=' + encodeURIComponent(id);
    if (param('agent-api') === 'test') {
      src += '&api=test';
      note('loading against the TEST api', 'warn');
    }

    var s = document.createElement('script');
    s.id = TAG_ID;
    s.async = true;
    s.src = src;

    s.onload = function () {
      note('sdk loaded, channel ' + id + ' on ' + (window.VERTICAL_KEY || '?'), 'ok');
      /* The SDK mounts asynchronously after its own bootstrap, so a missing
         node here means the channel id was rejected or the channel has no
         published deployment — both of which fail quietly on MindBehind's
         side and would otherwise look like "nothing happened". */
      setTimeout(function () {
        if (!document.getElementById(MOUNT_ID)) {
          note('sdk loaded but no widget mounted. Usually the channel has no ' +
               'published deployment, or the assistant version is not linked ' +
               'to this channel. Check it in isolation at ' +
               'https://app.mindbehind.com/chatbot-test?channelId=' + id, 'warn');
        }
      }, 4000);
    };

    s.onerror = function () {
      note('sdk failed to load from ' + SDK + ' — network, or the CDN is blocked', 'error');
    };

    document.head.appendChild(s);
    note('injecting channel ' + id, 'info');
    return true;
  }

  /* vertical.js writes VERTICAL_KEY at parse time and this file is loaded
     after it, so the first call normally succeeds. The poll is the same
     belt-and-braces config.js uses: if ordering ever changes, keep looking
     briefly rather than silently loading nothing. */
  if (!window.VERTICAL_KEY) {
    var tries = 0;
    var t = setInterval(function () {
      if (window.VERTICAL_KEY || ++tries > 100) { clearInterval(t); load(); }
    }, 20);
  } else {
    load();
  }

  /* --- what is NOT here yet -----------------------------------------------
     Passing page context into the conversation — vertical, brand, the product
     being viewed — so the agent knows which storefront it is standing on
     without inferring it from the question.

     Web Messenger does support parameters from the host page, but the key
     names for CUSTOM parameters are not the mb* layout flags above and are
     not written down anywhere I could confirm. Guessing them would produce a
     widget that looks configured and silently is not, which is worse than an
     obvious gap. See "Send Parameters from Webchat" in the MindBehind docs,
     or ask whoever provisioned the account.

     Until then, scoping is prompt-level: one agent per vertical, each told in
     its Default Instructions which brand it is and what that brand sells.
     ---------------------------------------------------------------------- */
})();
