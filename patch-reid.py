#!/usr/bin/env python3
"""Re-identify after mid-session writes; clear the tag's parent-domain cookies.
Run from the repo root: python3 patch-reid.py"""
import sys, io
def patch(path, pairs):
    s = io.open(path, encoding='utf-8').read()
    for old, new in pairs:
        if old not in s:
            sys.exit('STOP: expected text not found in ' + path + ':\n' + old[:120])
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)

patch('assets/store.js', [
("""      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (n.indexOf('ins-') === 0) document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      });
    } catch (e) {}
  }""",
"""      Object.keys(sessionStorage).filter(function (k) { return k.indexOf('ins-') === 0; })
        .forEach(function (k) { sessionStorage.removeItem(k); });
      /* The tag sets its cookies on the parent domain (.insiderdemo.com), so
         every storefront shares them: a session started on Ashford Lane is
         the session Meridian Air renders with. Expire each ins-* cookie on
         the hostname AND on every parent domain, or the wipe does nothing. */
      var host = location.hostname, parts = host.split('.'), domains = [''];
      for (var i = 0; i < parts.length - 1; i++) {
        var d = parts.slice(i).join('.');
        domains.push(d); domains.push('.' + d);
      }
      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim();
        if (n.indexOf('ins-') !== 0 && n.indexOf('spUID') !== 0) return;
        domains.forEach(function (d) {
          document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
        });
      });
    } catch (e) {}
  }

  /* --- re-identify from the profile --------------------------------------
     The tag fetches the profile's attribute values once, when its session
     starts, and renders every campaign from that copy until the session
     ends. An attribute written mid-session (trip_status after "Mark this
     flight as delayed", loyalty after a booking) lands on the profile but
     the page keeps rendering the old snapshot. refreshIdentity() ends the
     tag's session and loads `next` twice: the first load re-identifies the
     browser (user push with the uuid), the second renders with the values
     fetched for that identity. Callers give the write a moment to land
     before calling this. The #reid marker drives the second load. */
  function refreshIdentity(next) {
    clearInsiderIdentity();
    location.href = (next || location.pathname) + '#reid';
  }
  (function () {
    if (location.hash !== '#reid') return;
    setTimeout(function () {
      location.replace(location.pathname + location.search);
    }, 2500);
  })();"""),
("    currentUser: currentUser, signIn: signIn, signOut: signOut, userPayload: userPayload,",
 "    currentUser: currentUser, signIn: signIn, signOut: signOut, refreshIdentity: refreshIdentity, userPayload: userPayload,"),
])

patch('confirmation.html', [
("""      sim.innerHTML = 'trip_status is now <b>Delayed</b> on the profile. <a href="index.html">Go to the homepage</a> — the trip-status campaign reads it there.';""",
"""      sim.innerHTML = 'Updating your trip\\u2026 taking you to the homepage.';
      /* Give the write a moment to land, then re-identify so the homepage
         renders from the profile rather than the session's old snapshot. */
      setTimeout(function () { Store.refreshIdentity('index.html'); }, 2000);"""),
])
print('done — now: posh "Re-identify after trip status; clear parent-domain cookies"')
