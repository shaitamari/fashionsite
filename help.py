#!/usr/bin/env python3
"""Generate the help centre for every storefront: help/<key>/index.html plus
five pages the Shopping Agent's knowledge base can crawl and a visitor can
read. Static HTML, no JavaScript needed to render, so a crawler sees the
words — the storefront itself resolves its brand at runtime, which a
crawler never runs.

    python3 help.py            # all verticals
    python3 help.py beauty     # one

The point of these pages is that they hold facts the catalogue does not:
a returns window, which tier gets free delivery, a store's hours, what the
brand is for. That is what makes "ask the agent something only the page
knows" a demo rather than a claim. Every page carries a few deliberately
specific numbers for exactly that.
"""
import json, os, sys
from html import escape

os.chdir(os.path.dirname(os.path.abspath(__file__)))
V = json.load(open("verticals.json"))

# ---------------------------------------------------------------- content
# Per macro-vertical defaults, overridden per key where the brand needs its
# own facts. Keep numbers specific: they are what the agent gets asked.

RETAIL = dict(
    delivery_title="Delivery & returns",
    delivery=[
        ("Standard delivery", "Free on orders over €75, otherwise €4.95. Arrives in 2–4 working days across the UK and EU."),
        ("Next-day delivery", "€9.95, order before 8pm. Not available to the Channel Islands or the Canaries."),
        ("Click & collect", "Free, ready in two hours during store opening times. We hold collections for seven days."),
        ("Returns", "Thirty days from delivery, any reason, free returns label in the parcel. Refunds reach your card within five working days of the parcel arriving with us."),
        ("Exchanges", "Exchange in any store on the spot, or by post using the same label — mark the form 'exchange' and tell us the size or colour."),
    ],
    faq=[
        ("Can I change or cancel an order?", "Within an hour of placing it, yes — go to Orders in your account and choose Cancel. After that it's on its way, and returns are free anyway."),
        ("Do you ship internationally?", "To the UK, all EU countries, Switzerland and Norway. Not yet to the US or Australia."),
        ("How do I track my order?", "The dispatch email carries a tracking link, and Orders in your account shows the same thing. Ask our assistant and it will tell you where the parcel is."),
        ("What payment methods do you accept?", "Visa, Mastercard, American Express, Apple Pay, Google Pay and PayPal. Gift cards can be combined with any of them."),
        ("Is my size out of stock for good?", "Rarely. Tap Notify me on the product page and we'll message you the moment it's back — most sizes return within three weeks."),
        ("Do you price-match?", "No, but items bought in the fourteen days before a price drop are refunded the difference automatically."),
    ],
)
TRAVEL = dict(
    delivery_title="Bookings & changes",
    delivery=[
        ("Changing a booking", "Dates and rooms can be changed free of charge up to 48 hours before arrival. Inside 48 hours, the first night is charged."),
        ("Cancellation", "Flexible rates cancel free until 6pm local time the day before. Saver rates are non-refundable but can be moved once, within twelve months."),
        ("Check-in and check-out", "Check-in from 3pm, check-out by 11am. Early check-in and late check-out are free for Gold members where the room is available."),
        ("Payment", "Nothing is taken at booking on Flexible rates; we charge on arrival. Saver rates are charged in full when you book."),
        ("Group bookings", "Six rooms or more, or any event, go through our groups desk — email groups@ the brand domain and we reply the same working day."),
    ],
    faq=[
        ("Can I add breakfast after booking?", "Yes, in Manage booking or by asking the concierge. It's €22 a person a day, and free for Gold members."),
        ("Do you allow pets?", "Dogs under 15kg in selected rooms at every property except Casa Luz Kyoto. €25 a night, and we'll have a bed and bowls waiting."),
        ("Is parking available?", "Valet parking at every property, €30 a night. The Grand Lisbon also has a self-park garage two streets away at €18."),
        ("How do I use my points?", "Points can be redeemed against any stay from 5,000 points, or converted to airline miles with our partners at 1:1."),
        ("What's your Wi-Fi like?", "Free, fast and everywhere, including the pool. No login screen."),
        ("Can I request a specific room?", "Tell us your preference — high floor, quiet, sea view — and it's saved to your profile. We honour it whenever the room exists."),
    ],
)
AIR = dict(
    delivery_title="Bookings & changes",
    delivery=[
        ("Changing a flight", "Date or time changes are free on Flex fares. On Standard fares, €45 plus any fare difference; on Light fares, changes are not permitted."),
        ("Cancellation", "Flex fares refund in full up to two hours before departure. Standard and Light fares refund taxes only."),
        ("Baggage", "Light fares include one cabin bag. Standard and Flex include a 23kg checked bag. Extra bags are €35 each way when added before the day of travel, €60 at the airport."),
        ("Seats", "Standard seat selection is free at check-in, or €12 in advance. Extra-legroom seats are €28. Gold members select any seat free."),
        ("Check-in", "Online check-in opens 48 hours before departure and closes 60 minutes before. Bag drop closes 45 minutes before."),
    ],
    faq=[
        ("Can I change the name on a booking?", "Minor corrections (a typo) are free. A full name change is not permitted; cancel and rebook instead."),
        ("Do you offer special meals?", "Vegetarian, vegan, halal, kosher, gluten-free and child meals, requested at least 24 hours before departure on any long-haul flight."),
        ("What happens if my flight is delayed?", "We rebook you on the next available flight automatically and message you. Delays over three hours may qualify for compensation under EU261 — our team handles the claim."),
        ("How do I earn miles?", "Every fare earns miles; Flex earns double. Blue members earn 1 mile per euro spent, Silver 1.5, Gold 2."),
        ("Can I bring a musical instrument?", "Anything up to guitar size goes in the cabin as your bag. Larger instruments need a seat booked at the child fare."),
        ("Do you fly to Marrakesh year-round?", "Rome to Marrakesh runs daily from March to October and four times a week in winter."),
    ],
)
FS = dict(
    delivery_title="Applications & timings",
    delivery=[
        ("Opening an account", "Online in about eight minutes with a photo ID and a selfie. Most accounts are open the same day; some need a manual check, which takes up to two working days."),
        ("Applying for credit", "A decision in principle within minutes, with no mark on your credit file. A full application takes one working day."),
        ("Mortgages", "An agreement in principle the same day. A full offer typically takes ten working days once we have your documents and the valuation."),
        ("Switching to us", "The Current Account Switch Service moves everything across in seven working days, guaranteed. We handle the old bank."),
        ("Closing an account", "Any time, from the app, with any balance returned within three working days."),
    ],
    faq=[
        ("Is my money protected?", "Deposits are protected up to €100,000 per person under the deposit guarantee scheme."),
        ("How do I report a lost card?", "Freeze it in the app in one tap, then order a replacement — it arrives in two working days and works in your wallet immediately."),
        ("Do you charge for using my card abroad?", "No fees on card payments in any currency. Cash withdrawals abroad are free up to €200 a month, then 2%."),
        ("Can I book a call with an advisor?", "Yes — ask the assistant or use Book a call in the app. Slots are available weekdays 8am–8pm and Saturdays until 2pm."),
        ("What do the tiers include?", "Everyday is free. Plus adds travel insurance and fee-free foreign cash for €9 a month. Premier adds a dedicated advisor and airport lounge access for €25 a month."),
        ("How do I make a complaint?", "In the app under Help, or in writing. We acknowledge within two working days and resolve most cases within fifteen."),
    ],
)
TELCO = dict(
    delivery_title="Plans, top-ups & switching",
    delivery=[
        ("Changing plan", "Move up any time; the new plan starts immediately and we pro-rate the month. Move down at your next billing date."),
        ("Top-ups", "From €5 to €50, instant, from the app or any Vantis store. Top-ups never expire while the SIM is active."),
        ("Keeping your number", "Text PAC to 65075 on your old network, give us the code, and your number moves within one working day."),
        ("Roaming", "EU roaming is included on every plan at your home allowance. Outside the EU, a Travel Pass is €5 a day for 2GB."),
        ("Cancelling", "Pay-as-you-go: just stop. Monthly: thirty days' notice, no exit fee after the minimum term."),
    ],
    faq=[
        ("What's included in Vantis Unlimited?", "Unlimited data, calls and texts in the EU, 5G where available, and two Travel Pass days a month free."),
        ("Why is my data slow?", "Check you're on 5G in Settings; if you're on Vantis 5, the plan is capped at 10Mbps after 5GB. Vantis 20 and Unlimited are uncapped."),
        ("Can I get a new phone on my plan?", "Yes — any handset can be added to a Monthly plan over 24 or 36 months, with no upfront cost on most models."),
        ("How do I check my usage?", "The app shows it live. Or ask the assistant — it can see your plan and your remaining allowance."),
        ("Do you cover my area?", "99% 4G and 85% 5G coverage nationally. Enter a postcode on the Coverage page for street-level detail."),
        ("What is Vantis Business?", "Shared data across up to 20 SIMs, one bill, a named account manager and priority support."),
    ],
)
B2B = dict(
    delivery_title="Ordering, shipping & quotes",
    delivery=[
        ("Stocked items", "Ships the same day on orders placed before 3pm local time. Singapore and Johor next working day; Bangkok and Ho Chi Minh City in two to three."),
        ("Made-to-order and configured parts", "Lead time is shown on each product page and confirmed on the order acknowledgement. Most configured parts ship in five working days."),
        ("Volume pricing", "Quantity breaks apply automatically at 10, 50 and 200 units. For larger runs or annual contracts, request a quote and we reply within one working day."),
        ("Returns", "Stocked items can be returned within fourteen days, unused, in original packaging. Configured parts are non-returnable."),
        ("Account terms", "Account customers are invoiced monthly on thirty-day terms. Preferred and Key Account tiers have a named representative and priority allocation on constrained stock."),
    ],
    faq=[
        ("How do I find a part by specification?", "Search by part number, family or a spec such as bore, thread or voltage. The assistant can also cross-reference a competitor part number."),
        ("Can I order a sample?", "Single units of any stocked item can be ordered at the unit price. Samples of configured parts are quoted individually."),
        ("Do you supply CAD files?", "2D and 3D CAD for every product marked CAD-ready, downloadable from the product page after sign-in."),
        ("What are your quality certifications?", "Distribution is ISO 9001:2015 certified; certificates of conformance are available on request for any order line."),
        ("Can I split an order across sites?", "Yes — set a delivery site per line at checkout, or ask the assistant to split a quote across Singapore and Johor."),
        ("Who do I talk to about a technical question?", "Application engineers are available weekdays 9am–6pm SGT via chat or your account representative."),
    ],
)

MACRO = {"Retail": RETAIL, "Travel": TRAVEL, "Banking": FS, "Telco": TELCO, "B2B": B2B}

# Brand story per key — what the brand is, in two paragraphs. Written so the
# agent has a "why us" answer.
ABOUT = {
    "fashion": "Ashford Lane started in 2011 as a single shop on Regent Street selling well-made everyday clothes at honest prices. Fifteen years later there are three stores and a site that ships across Europe, but the idea hasn't moved: clothes you'll wear for years, cut properly, priced so you don't have to think twice.|We design everything ourselves in London and make in small runs with the same factories we've worked with since the start — mostly in Portugal and Italy. Nothing is made to be replaced next season.",
    "beauty": "Lumen is a beauty retailer with a point of view: fewer, better products, chosen by people who use them. We opened on Oxford Street in 2016 and now run three stores and this site.|Every product we stock passes a two-week test by our own advisors before it goes on sale, and we drop anything that doesn't hold up. Our consultations are free, unhurried and never end in a hard sell.",
    "home": "Aldgate makes furniture for the way people actually live — sofas that survive children, tables that take a laptop and a dinner party, storage that fits the flat you have rather than the house you'd like.|Designed in London, made in Lithuania and Portugal, delivered by our own teams who assemble everything and take the packaging away. Our design consultants will plan a room with you for free.",
    "luxury": "Beaumont Vale is a house founded in Mayfair in 1974, with boutiques in Milan and Paris. We make a small number of things exceptionally well: coats, leather goods, knitwear and jewellery.|Clients are looked after by name. Private viewings, fittings and collection previews are arranged through your boutique, and anything you buy can be repaired by the atelier that made it.",
    "electronics": "Kestrel is an electronics retailer for people who want the right thing, not the newest thing. We stock fewer products than the big chains and know every one of them.|Our advisors will tell you when something isn't worth the money, and our installation team will set it up properly. Two-year warranty on everything, no registration required.",
    "supermarket": "Harvest Row is a neighbourhood grocer with three stores in north London and delivery across the city. Fresh food from named farms, a good wine wall, and the everyday things at fair prices.|We deliver in one-hour slots from 7am to 10pm in electric vans, and our pickers will call you about substitutions rather than guessing.",
    "hotels": "Wayfarer runs three hotels — The Grand Lisbon, Casa Luz Kyoto and Riverside Lodge Amalfi — each different, each looked after as if it were the only one.|We don't do loyalty tiers you have to work for: stay twice and you're Silver, five times and you're Gold, with late check-out, breakfast and the room you prefer.",
    "airlines": "Meridian Air flies three routes and flies them well: London–New York, Paris–Tokyo and Rome–Marrakesh. New aircraft, a crew who stay with the airline, and fares that say what they include.|Blue, Silver and Gold members earn miles on every fare and use them on any seat, with no blackout dates.",
    "banking": "Northbank is a bank built in the last decade, with none of the branches and all of the licence. Everyday, Plus and Premier accounts, savings, cards, loans and mortgages, run from an app that people actually like.|Real advisors on the phone weekdays and Saturdays, plain-language products, and no fee we haven't told you about first.",
    "insurance": "Fairhaven insures homes, cars, trips and pets, and pays claims quickly — the median home claim is settled in nine days.|Three levels of cover on every product, priced clearly, with the exclusions written in the same size type as everything else.",
    "fintech": "Loop is a money app for people who move: spend abroad without fees, split bills with friends, save automatically and invest from a euro.|Free to start. Plus and Premium add travel insurance, higher limits and priority support. Metal is for people who want the card to match.",
    "telco": "Vantis is a mobile network with three plans and no small print: Vantis 5, Vantis 20 and Vantis Unlimited. EU roaming included on all of them, and a Business plan for teams.|We own our network, which is why coverage is 99% and support is answered by people who can actually fix things.",
    "nutrition": "Verdant makes supplements, superfoods and snacks for people who want a routine that sticks: protein, greens, vitamins and the occasional very good bar.|Everything is third-party tested, every subscription can be paused from the app, and our coaches will build you a routine around a goal, not a product.",
    "misumi": "MISUMI supplies industrial components, tools and equipment to manufacturers across Southeast Asia — cutting tools, automation, fasteners, motion, workshop equipment and consumables, from stock.|Account customers get volume pricing, named representatives and priority allocation. Application engineers are available every working day.",
}

# Stores / contact per key (some verticals are online-only or have properties
# rather than stores).
STORES = {
    "fashion": ("Stores", ["Regent Street, London — Mon–Sat 10–8, Sun 12–6", "Trinity, Leeds — Mon–Sat 9–7, Sun 11–5", "Buchanan Street, Glasgow — Mon–Sat 9–7, Sun 11–5"]),
    "beauty": ("Stores", ["Oxford Street, London — Mon–Sat 10–8, Sun 12–6", "Shoreditch, London — Mon–Sun 10–7", "Market Street, Manchester — Mon–Sat 9–7, Sun 11–5"]),
    "home": ("Showrooms", ["Aldgate, London — Mon–Sat 10–7, Sun 11–5", "Clerkenwell design studio — by appointment", "Manchester Northern Quarter — Mon–Sat 10–6"]),
    "luxury": ("Boutiques", ["Mount Street, Mayfair — Mon–Sat 10–6", "Via Montenapoleone, Milan — Mon–Sat 10–7", "Rue Saint-Honoré, Paris — Mon–Sat 10–7"]),
    "electronics": ("Stores", ["Tottenham Court Road, London — Mon–Sat 10–8, Sun 12–6", "Bullring, Birmingham — Mon–Sat 9–8, Sun 11–5", "Installation team — nationwide, weekdays and Saturdays"]),
    "supermarket": ("Stores", ["Camden — daily 7am–11pm", "Islington — daily 7am–11pm", "Hackney — daily 7am–10pm"]),
    "hotels": ("Properties", ["The Grand Lisbon — Praça do Comércio, Lisbon", "Casa Luz Kyoto — Higashiyama, Kyoto", "Riverside Lodge Amalfi — Amalfi Coast"]),
    "airlines": ("Routes & lounges", ["London Heathrow — Meridian Lounge, Terminal 3", "Paris CDG — Meridian Lounge, Terminal 2E", "Rome Fiumicino — partner lounge, Terminal 1"]),
    "banking": ("Contact", ["Phone: weekdays 8am–8pm, Saturdays 9am–2pm", "Chat: in the app, 24 hours", "Post: Northbank, 1 Bankside, London SE1"]),
    "insurance": ("Contact", ["Claims line: 24 hours, every day", "Quotes and renewals: weekdays 8am–8pm", "Post: Fairhaven, 40 Harbour Street, Bristol"]),
    "fintech": ("Contact", ["Chat: in the app, 24 hours", "Premium and Metal: priority line, weekdays 7am–11pm", "Card issues: freeze in the app first, then chat"]),
    "telco": ("Stores", ["Westfield London — Mon–Sat 10–9, Sun 12–6", "Trafford Centre, Manchester — Mon–Sat 10–9, Sun 12–6", "Support: 24 hours by chat, 8am–10pm by phone"]),
    "nutrition": ("Contact", ["Coaches: chat, weekdays 8am–8pm", "Subscriptions: pause, skip or change any time in the app", "Post: Verdant, Unit 4, Bermondsey, London SE16"]),
    "misumi": ("Distribution & support", ["Singapore — Tuas distribution centre, ships same day before 3pm", "Johor — Senai warehouse, next-day to Klang Valley", "Bangkok and Ho Chi Minh City — regional stock, 2–3 day delivery", "Application engineers: weekdays 9am–6pm SGT"]),
}

# ---------------------------------------------------------------- render

CSS = """
:root{--bg:%(bg)s;--alt:%(alt)s;--ink:%(ink)s;--muted:%(muted)s;--rule:%(rule)s;--accent:%(accent)s}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 %(body)s}
a{color:var(--accent)}.wrap{max-width:820px;margin:0 auto;padding:0 1.25rem}
header{border-bottom:1px solid var(--rule);background:var(--alt)}header .wrap{display:flex;justify-content:space-between;align-items:center;height:64px}
.brand{font:600 1.25rem/1 %(display)s;color:var(--ink);text-decoration:none;letter-spacing:.01em}
nav a{margin-left:1.25rem;color:var(--muted);text-decoration:none;font-size:.95rem}nav a[aria-current]{color:var(--ink)}
h1{font:600 2rem/1.15 %(display)s;margin:2.5rem 0 .5rem}h2{font:600 1.2rem/1.3 %(display)s;margin:2rem 0 .5rem}
.lede{color:var(--muted);margin:0 0 2rem}dl{margin:0}dt{font-weight:600;margin-top:1.25rem}dd{margin:.25rem 0 0}
ul.cards{list-style:none;padding:0;margin:2rem 0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
ul.cards li{border:1px solid var(--rule);border-radius:10px;padding:1.1rem;background:var(--alt)}ul.cards a{font-weight:600;text-decoration:none;color:var(--ink)}
ul.cards p{margin:.35rem 0 0;color:var(--muted);font-size:.95rem}footer{margin-top:4rem;border-top:1px solid var(--rule);padding:2rem 0;color:var(--muted);font-size:.9rem}
"""

PAGES = [("index", "Help centre"), ("faq", "Frequently asked questions"), ("delivery", None),
         ("loyalty", "Membership & rewards"), ("stores", None), ("about", None)]


def page(cfg, key, slug, title, body_html, current):
    theme = cfg["theme"]
    nav = "".join(
        f'<a href="{s}.html"{" aria-current=\"page\"" if s == current else ""}>{escape(t)}</a>'
        for s, t in [("index", "Help"), ("faq", "FAQ"), ("delivery", MACRO[cfg["vertical"]]["delivery_title"]),
                     ("loyalty", "Rewards"), ("stores", STORES[key][0]), ("about", "About")])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)} — {escape(cfg['brand'])}</title>
<meta name="description" content="{escape(title)} for {escape(cfg['brand'])}: {escape(cfg['tagline'])}.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{theme['fonts']}&display=swap">
<style>{CSS % theme}</style></head>
<body><header><div class="wrap"><a class="brand" href="../../index.html">{escape(cfg['brand'])}</a><nav>{nav}</nav></div></header>
<main class="wrap">{body_html}</main>
<footer><div class="wrap">{escape(cfg['brand'])} — {escape(cfg['tagline'])}. <a href="../../index.html">Back to the store</a></div></footer>
</body></html>"""


def dl(items):
    return "<dl>" + "".join(f"<dt>{escape(q)}</dt><dd>{escape(a)}</dd>" for q, a in items) + "</dl>"


def build(key):
    cfg = V[key]
    macro = MACRO[cfg["vertical"]]
    brand = cfg["brand"]
    out = f"help/{key}"
    os.makedirs(out, exist_ok=True)
    tiers = cfg.get("profile", {}).get("tiers", [])
    stores_title, stores = STORES[key]
    about = ABOUT[key].split("|")

    # index
    cards = [("faq.html", "Frequently asked questions", "Orders, payment, sizes, tracking — the short answers."),
             ("delivery.html", macro["delivery_title"], "Timings, costs and what happens when you change your mind."),
             ("loyalty.html", "Membership & rewards", f"What {', '.join(tiers)} each include."),
             ("stores.html", stores_title, "Where to find us and when we're open."),
             ("about.html", f"About {brand}", "Who we are and how we work.")]
    body = f"<h1>How can we help?</h1><p class='lede'>Everything about shopping with {escape(brand)}, in one place. Our assistant on the store can answer any of this too — just ask.</p>"
    body += "<ul class='cards'>" + "".join(f"<li><a href='{h}'>{escape(t)}</a><p>{escape(d)}</p></li>" for h, t, d in cards) + "</ul>"
    open(f"{out}/index.html", "w").write(page(cfg, key, "index", "Help centre", body, "index"))

    # faq
    body = f"<h1>Frequently asked questions</h1><p class='lede'>The questions we get most, answered plainly.</p>{dl(macro['faq'])}"
    open(f"{out}/faq.html", "w").write(page(cfg, key, "faq", "Frequently asked questions", body, "faq"))

    # delivery / bookings
    body = f"<h1>{escape(macro['delivery_title'])}</h1><p class='lede'>Timings, costs and what happens when plans change.</p>{dl(macro['delivery'])}"
    open(f"{out}/delivery.html", "w").write(page(cfg, key, "delivery", macro["delivery_title"], body, "delivery"))

    # loyalty — from the vertical's own tiers, with concrete benefits
    perks = [
        ("Free — everyone who creates an account.", "Order history, saved preferences, birthday offer, early sale access by email."),
        ("Reached automatically after three orders in a year.", "Free standard delivery on every order, a dedicated line to our assistant, and previews a day before everyone else."),
        ("Reached after ten orders or €1,500 in a year.", "Free next-day delivery, free returns collection from home, invitations to in-store events, and a personal advisor who knows what you like."),
    ]
    if cfg["vertical"] == "Travel":
        perks = [("Free — everyone who creates an account.", "Member rates, saved preferences, points on every stay or flight."),
                 ("After two stays or four flights in a year.", "Late check-out or free seat selection, priority support, and a welcome we get right."),
                 ("After five stays or ten flights in a year.", "Free breakfast or lounge access, upgrades where available, and the room or seat you prefer, every time.")]
    elif cfg["vertical"] == "Banking":
        perks = [("The standard account or cover, free of monthly fees.", "Everything you need to start, with no fee you weren't told about."),
                 ("A monthly fee with real benefits.", "Travel cover, higher limits, fee-free cash abroad, faster support."),
                 ("For people who want a named person.", "A dedicated advisor, priority claims or lending decisions, and lounge access where it applies.")]
    elif cfg["vertical"] == "Telco":
        perks = [("Pay as you go — no contract.", "Top up when you like; allowances never expire while the SIM is active."),
                 ("Monthly — one bill, more for the money.", "5G, EU roaming included, handset finance available."),
                 ("Business — for teams.", "Shared data across up to 20 SIMs, one bill, a named account manager.")]
    elif cfg["vertical"] == "B2B":
        perks = [("Any registered business.", "Online ordering, volume price breaks, thirty-day invoicing after credit approval."),
                 ("Over €25,000 a year.", "A named representative, priority allocation on constrained stock, quarterly pricing review."),
                 ("Over €100,000 a year or a framework agreement.", "Contract pricing, consignment stock options, dedicated application engineering support.")]
    elif key == "nutrition":
        perks = [("Free — everyone who creates an account.", "Saved routine, coach chat, order history."),
                 ("Anyone with an active subscription.", "15% off every order, free delivery, pause or skip any time."),
                 ("Two or more active subscriptions.", "20% off, a free product every quarter, and a coach check-in every month.")]
    rows = list(zip(tiers, perks))
    body = f"<h1>Membership & rewards</h1><p class='lede'>Three tiers. You move up on your own; nothing to sign up for twice.</p>"
    for t, (how, what) in rows:
        body += f"<h2>{escape(t)}</h2><p><strong>How you get it:</strong> {escape(how)}</p><p><strong>What it includes:</strong> {escape(what)}</p>"
    body += "<p class='lede' style='margin-top:2rem'>Your tier is shown on every page once you're signed in, and our assistant can tell you how close you are to the next one.</p>"
    open(f"{out}/loyalty.html", "w").write(page(cfg, key, "loyalty", "Membership & rewards", body, "loyalty"))

    # stores
    body = f"<h1>{escape(stores_title)}</h1><p class='lede'>Where to find us and when we're open.</p><dl>" + "".join(
        f"<dt>{escape(s.split(' — ')[0])}</dt><dd>{escape(s.split(' — ', 1)[1] if ' — ' in s else '')}</dd>" for s in stores) + "</dl>"
    open(f"{out}/stores.html", "w").write(page(cfg, key, "stores", stores_title, body, "stores"))

    # about
    body = f"<h1>About {escape(brand)}</h1><p class='lede'>{escape(cfg['tagline'])}.</p>" + "".join(f"<p>{escape(x)}</p>" for x in about)
    open(f"{out}/about.html", "w").write(page(cfg, key, "about", f"About {brand}", body, "about"))

    # all-in-one page for the knowledge base crawl. Agent One allows five
    # sources per knowledge base and four knowledge bases per account, so a
    # brand gets ONE crawled page, not five, and a knowledge base holds up to
    # five brands. Every heading and every answer names the brand, so that
    # when several brands share a knowledge base the retrieved text carries
    # its own attribution and the agent can tell whose policy it is reading.
    B = escape(brand)
    def qa(items):
        return "<dl>" + "".join(f"<dt>{B}: {escape(q)}</dt><dd>{B}. {escape(a)}</dd>" for q, a in items) + "</dl>"
    body = f"<h1>{B} — everything a customer asks</h1><p class='lede'>{escape(cfg['tagline'])}. This page covers {B}'s {escape(macro['delivery_title'].lower())}, questions, membership tiers, {escape(stores_title.lower())} and story. Every answer below is about {B} only.</p>"
    body += f"<h2>{B}: {escape(macro['delivery_title'])}</h2>" + qa(macro["delivery"])
    body += f"<h2>{B}: Frequently asked questions</h2>" + qa(macro["faq"])
    body += f"<h2>{B}: Membership and rewards</h2><dl>" + "".join(
        f"<dt>{B} {escape(t)} tier</dt><dd>{B} {escape(t)} — how you get it: {escape(how)} What it includes: {escape(what)}</dd>" for t, (how, what) in rows) + "</dl>"
    body += f"<h2>{B}: {escape(stores_title)}</h2><dl>" + "".join(
        f"<dt>{B} — {escape(x.split(' — ')[0])}</dt><dd>{B} {escape(x.split(' — ')[0])}: {escape(x.split(' — ', 1)[1] if ' — ' in x else '')}</dd>" for x in stores) + "</dl>"
    body += f"<h2>About {B}</h2>" + "".join(f"<p>{escape(x)}</p>" for x in about)
    open(f"{out}/all.html", "w").write(page(cfg, key, "all", f"{brand} — everything a customer asks", body, "index"))
    return out


if __name__ == "__main__":
    keys = [a for a in sys.argv[1:] if a in V] or [k for k in V if not k.startswith("_")]
    for k in keys:
        print(build(k))
