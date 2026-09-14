#!/usr/bin/env python3
"""Re-identify as a debt: any page pays it if the writing page was left early.
Run from the repo root."""
import io, sys
p='assets/store.js'; s=io.open(p,encoding='utf-8').read()
old="""  function refreshIdentity(next) {
    clearInsiderIdentity();"""
new="""  /* A profile write that a campaign reads marks a refresh as owed. The
     writing page normally pays it a few seconds later; if the visitor leaves
     first, the next page loads, sees the debt, and pays it instead. Cleared
     only when the two-load refresh has completed. */
  var OWED = 'lmn.reid_owed';
  function oweRefresh() { try { localStorage.setItem(OWED, '1'); } catch (e) {} }
  function refreshIdentity(next) {
    oweRefresh();
    clearInsiderIdentity();"""
if old not in s: sys.exit('STOP: refreshIdentity not found')
s=s.replace(old,new,1)
old2="""  (function () {
    if (location.hash !== '#reid') return;
    document.addEventListener('DOMContentLoaded', function () {"""
new2="""  (function () {
    if (location.hash !== '#reid') {
      // Debt from a page that was left early: pay it now.
      try {
        if (localStorage.getItem(OWED) === '1') { setTimeout(function () { refreshIdentity(location.pathname); }, 300); }
      } catch (e) {}
      return;
    }
    try { localStorage.removeItem(OWED); } catch (e) {}
    document.addEventListener('DOMContentLoaded', function () {"""
if old2 not in s: sys.exit('STOP: reid handler not found')
s=s.replace(old2,new2,1)
# syncAttributes marks the debt as soon as a write is made
old3="""  function syncAttributes(custom) {
    return fetch('/.netlify/functions/sync', {"""
new3="""  function syncAttributes(custom) {
    oweRefresh();
    return fetch('/.netlify/functions/sync', {"""
if old3 not in s: sys.exit('STOP: syncAttributes not found')
s=s.replace(old3,new3,1)
io.open(p,'w',encoding='utf-8').write(s); print('patched', p)
print('done — now: posh "Re-identify owed until paid"')
