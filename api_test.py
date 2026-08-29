#!/usr/bin/env python3
"""Push one test profile and confirm what the Upsert API accepts.

    python3 api_test.py

Before building a seeder we need to know three things:
  1. do the credentials work
  2. do BACKDATED events land with their own timestamp, or with today's
  3. do array-of-objects attributes land

Everything downstream depends on 2. If history is silently rewritten to now,
then "she bought this three months ago" is not a story we can tell, and the
demo scripts have to be built around a much shorter timeline.

Credentials come from .env, never from this file:

    PARTNER_NAME=partnersandbox
    REQUEST_TOKEN=INS....
"""
import json, os, ssl, sys, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ENDPOINT = "https://unification.useinsider.com/api/user/v1/upsert"


def load_env(path=".env"):
    if not os.path.exists(path):
        sys.exit(f"No {path}. Create it with PARTNER_NAME and REQUEST_TOKEN.")
    env = {}
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    for key in ("PARTNER_NAME", "REQUEST_TOKEN"):
        if not env.get(key):
            sys.exit(f"{key} missing from {path}")
    return env


def ssl_ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        c = ssl.create_default_context()
        c.check_hostname = False
        c.verify_mode = ssl.CERT_NONE
        return c


def post(env, payload):
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={
            "X-PARTNER-NAME": env["PARTNER_NAME"].lower(),
            "X-REQUEST-TOKEN": env["REQUEST_TOKEN"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx()) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def main():
    env = load_env()
    now = datetime.now(timezone.utc)

    def ago(days):
        return (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def ahead(days):
        return (now + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # @insiderdemo.com has no MX records, so nothing can ever be delivered to
    # these addresses even if a journey is activated by accident.
    email = "seed.test@insiderdemo.com"

    payload = {
        "users": [{
            "identifiers": {"email": email},
            "attributes": {
                "name": "Test", "surname": "Profile",
                "email_optin": True, "sms_optin": True,
                "whatsapp_optin": False, "gdpr_optin": True,
                "language": "en_GB", "country": "GB",
                # Two DEFAULT attributes alongside the custom ones. Defaults
                # always exist, so if these land and the customs do not, the
                # problem is specific to custom attributes rather than the
                # payload, the credentials or the account.
                "city": "Manchester",
                "gender": "F",
                "custom": {
                    "seed_profile": "true",          # declared String
                    "current_plan": "Vantis 20",     # String
                    "contract_end": ahead(47),       # Date
                },
            },
            # Several plans on one profile — the shape the renewal journeys need.
            "object_attributes": {
                "custom": {
                    "plans": [{
                        "action": "add",
                        "value": [{
                            "plan_id": "VNT-20",
                            "plan_name": "Vantis 20",
                            "status": "active",
                            "monthly_price": 22.0,
                            "renewal_date": ahead(47),
                        }],
                    }]
                }
            },
            # The question that matters: 92 days ago, or today?
            "events": [
                {"event_name": "purchase", "timestamp": ago(92),
                 "event_params": {
                     "product_id": "SEED-TEST-1", "name": "Backdated Test Purchase",
                     "unit_price": 149.0, "unit_sale_price": 149.0,
                     "event_group_id": "SEED-ORDER-1",
                     "taxonomy": ["Telco", "Devices"],
                     "currency": "EUR", "quantity": 1}},
                {"event_name": "purchase", "timestamp": ago(12),
                 "event_params": {
                     "product_id": "SEED-TEST-2", "name": "Recent Test Purchase",
                     "unit_price": 39.0, "unit_sale_price": 39.0,
                     "event_group_id": "SEED-ORDER-2",
                     "taxonomy": ["Telco", "Accessories"],
                     "currency": "EUR", "quantity": 1}},
            ],
        }]
    }

    print(f"partner : {env['PARTNER_NAME'].lower()}")
    print(f"profile : {email}")
    print(f"events  : purchase €149 dated {ago(92)[:10]} (92 days ago)")
    print(f"          purchase  €39 dated {ago(12)[:10]} (12 days ago)")
    print(f"array   : one active plan renewing {ahead(47)[:10]}")
    print(f"control : city=Manchester, gender=F  (default attributes)\n")

    status, body = post(env, payload)
    print(f"HTTP {status}")
    print(json.dumps(body, indent=2) if isinstance(body, dict) else body)

    if status == 200:
        print(f"""
Accepted. Now check the profile in InOne — search users for {email}.

  1. Do City and Gender show on the profile?
       both present  -> the payload and credentials are fine, and the
                        problem is specific to custom attributes
       both missing  -> the whole attributes object is being ignored,
                        which is a different and bigger problem

  2. Array of Objects tab — is the plan there?

  3. Audience estimate: purchased over EUR 100 in the last 30 days should
     NOT match (the 149 is 92 days old); last 6 months SHOULD. That is the
     real test of whether backdating worked.""")
    elif status == 403:
        print("\n403 — check the token and that the partner name is lowercase.")
    elif status == 429:
        print("\n429 — rate limited. Wait and retry.")


if __name__ == "__main__":
    main()
