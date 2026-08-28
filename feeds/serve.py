#!/usr/bin/env python3
"""Local dev server that mirrors the production no-store headers.

    python3 serve.py          # http://localhost:8000

Using this instead of a plain `python3 -m http.server` matters: the default
server sends Last-Modified and lets the browser cache, which is exactly the
behaviour this site exists to avoid.
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, *args, **kwargs):
        super().send_response(*args, **kwargs)


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as httpd:
    print(f"Meridian demo on http://localhost:{PORT}  (no-store headers active)")
    httpd.serve_forever()
