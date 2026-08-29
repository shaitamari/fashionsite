#!/usr/bin/env python3
"""Add per-vertical profile fields and a service flow to verticals.json.

    python3 add_flows.py

Merges into whatever verticals exist locally, leaving everything else alone.

Why it is shaped this way: custom ATTRIBUTES are capped at 80 per account and
partnersandbox is already at 70, but custom EVENTS are uncapped. So verticals
are differentiated by the events they fire and by the labels and options on a
small shared set of attributes — not by adding new attributes each time.

That means one new attribute, `service_preference`, which is labelled
differently per vertical (Skin type, Seat preference, Life stage…), plus a
flow page whose events are unique per vertical and cost nothing.
"""
import json, os, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

LEDE = {'beauty': 'Book time with an advisor for a colour match, a skincare consult or a lesson.', 'fashion': 'Book a fitting, alterations or an hour with a personal stylist.', 'electronics': 'Arrange delivery, installation and removal of your old appliance.', 'home': 'Talk through a room with a designer, in store, at home or over video.', 'luxury': 'Request a private appointment with a client advisor at your boutique.', 'supermarket': 'Choose a delivery slot and a store. Change or cancel any time.', 'telco': 'Top up, change plan, add a data boost or renew your contract.', 'hotels': 'Add breakfast, request a late checkout, or change the dates of a stay.', 'airlines': 'Add a bag, choose a seat, book lounge access or move a flight.', 'banking': 'Start an application. It takes a few minutes and you can save and return.', 'insurance': 'Tell us what you need covered and we will price it in a minute.', 'fintech': 'Upgrade, downgrade or add an account. Changes apply from your next cycle.'}

PROFILE = {
  "beauty":      {"tiers": ["Member", "Insider", "VIP"],
                  "service": ("Skin type", ["Dry", "Oily", "Combination", "Sensitive", "Normal"]),
                  "flow": ("Book a consultation", "consultation_booked",
                           [("Service", "service", ["Colour match", "Skincare consult", "Makeup lesson"]),
                            ("Store", "store", ["Oxford Street", "Shoreditch", "Manchester"]),
                            ("Date", "date", "date")])},
  "fashion":     {"tiers": ["Member", "Silver", "Gold"],
                  "service": ("Size preference", ["XS", "S", "M", "L", "XL"]),
                  "flow": ("Book a fitting", "fitting_booked",
                           [("Service", "service", ["Personal styling", "Alterations", "Fitting"]),
                            ("Store", "store", ["Regent Street", "Leeds", "Glasgow"]),
                            ("Date", "date", "date")])},
  "electronics": {"tiers": ["Member", "Plus", "Pro"],
                  "service": ("Home setup", ["Flat", "House", "Studio", "Shared"]),
                  "flow": ("Book installation", "installation_booked",
                           [("Service", "service", ["Delivery only", "Install & remove old", "Full setup"]),
                            ("Slot", "slot", ["Morning", "Afternoon", "Evening"]),
                            ("Date", "date", "date")])},
  "home":        {"tiers": ["Member", "Silver", "Gold"],
                  "service": ("Room I'm working on", ["Living room", "Bedroom", "Kitchen", "Office"]),
                  "flow": ("Book a design consult", "design_consult_booked",
                           [("Service", "service", ["In-store consult", "Home visit", "Video call"]),
                            ("Room", "room", ["Living room", "Bedroom", "Kitchen", "Office"]),
                            ("Date", "date", "date")])},
  "luxury":      {"tiers": ["Client", "Private Client", "Cercle"],
                  "service": ("Preferred boutique", ["Mayfair", "Milan", "Paris", "Online only"]),
                  "flow": ("Request an appointment", "appointment_requested",
                           [("Service", "service", ["Private viewing", "Personal shopping", "Repairs"]),
                            ("Boutique", "store", ["Mayfair", "Milan", "Paris"]),
                            ("Date", "date", "date")])},
  "supermarket": {"tiers": ["Member", "Plus", "Plus Annual"],
                  "service": ("Dietary preference", ["None", "Vegetarian", "Vegan", "Gluten Free", "Dairy Free"]),
                  "flow": ("Book a delivery slot", "delivery_slot_booked",
                           [("Slot", "slot", ["Morning", "Afternoon", "Evening"]),
                            ("Store", "store", ["Camden", "Islington", "Hackney"]),
                            ("Date", "date", "date")])},
  "telco":       {"tiers": ["Pay As You Go", "Monthly", "Business"],
                  "service": ("Plan type", ["SIM only", "Phone on contract", "Broadband", "Business"]),
                  "flow": ("Top up or change plan", "plan_changed",
                           [("Action", "action", ["Top up credit", "Upgrade plan", "Add data boost", "Renew contract"]),
                            ("Plan", "plan", ["Vantis 5", "Vantis 20", "Vantis Unlimited"]),
                            ("Amount", "amount", ["10", "20", "30", "50"])])},
  "hotels":      {"tiers": ["Member", "Silver", "Gold"],
                  "service": ("Room preference", ["Quiet floor", "High floor", "Near lift", "Accessible"]),
                  "flow": ("Manage a booking", "booking_managed",
                           [("Action", "action", ["Add breakfast", "Late checkout", "Airport transfer", "Change dates"]),
                            ("Property", "store", ["The Grand Lisbon", "Casa Luz Kyoto", "Riverside Lodge Amalfi"]),
                            ("Date", "date", "date")])},
  "airlines":    {"tiers": ["Blue", "Silver", "Gold"],
                  "service": ("Seat preference", ["Window", "Aisle", "Extra legroom", "No preference"]),
                  "flow": ("Manage a trip", "trip_managed",
                           [("Action", "action", ["Add bag", "Choose seat", "Add lounge", "Change flight"]),
                            ("Route", "route", ["London to New York", "Paris to Tokyo", "Rome to Marrakesh"]),
                            ("Date", "date", "date")])},
  "banking":     {"tiers": ["Everyday", "Plus", "Premier"],
                  "service": ("Life stage", ["Renting", "First home", "Moving", "Family", "Retiring"]),
                  "flow": ("Start an application", "application_started",
                           [("Product", "product", ["Current account", "Credit card", "Personal loan", "Mortgage"]),
                            ("Purpose", "purpose", ["Everyday banking", "Consolidate debt", "Buy a home", "Save"]),
                            ("Amount", "amount", ["1000", "5000", "25000", "250000"])])},
  "insurance":   {"tiers": ["Standard", "Plus", "Premier"],
                  "service": ("What matters most", ["Lowest price", "Best cover", "Fast claims", "Flexible excess"]),
                  "flow": ("Get a quote", "quote_requested",
                           [("Cover", "product", ["Car", "Home", "Travel", "Pet", "Life"]),
                            ("Level", "level", ["Third Party", "Standard", "Comprehensive"]),
                            ("Excess", "amount", ["100", "250", "500"])])},
  "fintech":     {"tiers": ["Free", "Plus", "Premium"],
                  "service": ("Mainly used for", ["Everyday spending", "Travel", "Investing", "Business"]),
                  "flow": ("Change your plan", "plan_changed",
                           [("Action", "action", ["Upgrade", "Downgrade", "Add currency account", "Invite a friend"]),
                            ("Plan", "plan", ["Free", "Plus", "Premium", "Metal"]),
                            ("Billing", "billing", ["Monthly", "Annual"])])},
}


def main():
    if not os.path.exists("verticals.json"):
        sys.exit("No verticals.json here — run this from the site folder.")

    cfg = json.load(open("verticals.json"))
    applied, skipped = [], []

    for key, p in PROFILE.items():
        if key not in cfg:
            skipped.append(key)
            continue
        label, options = p["service"]
        title, event, fields = p["flow"]
        cfg[key]["profile"] = {
            "tiers": p["tiers"],
            "service_attribute": {
                # One attribute, twelve labels. Declare `service_preference`
                # once in Attributes and Events as a String.
                "name": "service_preference",
                "label": label,
                "options": options,
            },
        }
        cfg[key]["flow"] = {
            "title": title,
            "lede": LEDE.get(key, ""),
            "event": event,
            "fields": [{"label": l, "name": n, "options": o} for l, n, o in fields],
        }
        applied.append(key)

    json.dump(cfg, open("verticals.json", "w"), indent=2)

    print(f"\nUpdated {len(applied)}: {', '.join(sorted(applied))}")
    if skipped:
        print(f"Not present, skipped: {', '.join(sorted(skipped))}")

    print("\nOne attribute to declare in InOne > Components > Attributes and Events:")
    print("    service_preference   String")
    print("\nCustom events these pages will fire (no need to pre-declare, and")
    print("they do not count against the 80-attribute limit):")
    for k in sorted(applied):
        print(f"    {k:14s} {cfg[k]['flow']['event']}")


if __name__ == "__main__":
    main()
