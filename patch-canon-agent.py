#!/usr/bin/env python3
"""
patch-canon-agent.py

Points the canon storefront at its own MindBehind Web Messenger channel
("Canon Web") instead of the shared one, and corrects the two comments that
still describe Canon as living in its own en_CA locale.

Touches assets/agent.js only. Idempotent: run it twice and the second run
STOPs without writing.

Usage:
    python3 patch-canon-agent.py              # run from the repo root
    python3 patch-canon-agent.py /path/to/posh
"""

import sys
from pathlib import Path

CANON_CHANNEL = "6aa51e051e38ba0119dfca63"

OLD_ENTRY = "    canon:       SHARED   // Canon — the shared agent, like every other storefront"
NEW_ENTRY = (
    "    canon:       { sandbox: '" + CANON_CHANNEL + "', demo: null }   "
    "// Canon — own agent, own instructions"
)

OLD_NOTE = """     MISUMI and Canon are separate on purpose: POCs with their own knowledge
     base, and Canon in its own locale (en_CA), so a customer's agent only
     ever sees the customer's catalogue. */"""

NEW_NOTE = """     MISUMI and Canon are separate on purpose: POCs with their own agent, so
     the customer's rules and knowledge base apply to that storefront and
     nowhere else. Canon reads the shared en_GB catalogue like the other
     storefronts; only its instructions are its own. */"""

OLD_LOCALE = """     message as productId, and the Shopping Agent takes it as item_id. So "this
     product" and the storefront's locale (Canon is en_CA) reach the agent
     without any parameter from this file."""

NEW_LOCALE = """     message as productId, and the Shopping Agent takes it as item_id. So "this
     product" and the storefront's locale reach the agent without any
     parameter from this file."""


def stop(msg):
    print("STOP: " + msg)
    sys.exit(0)


def main():
    root = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.cwd()
    target = root / "assets" / "agent.js"

    if not target.exists():
        stop(f"{target} not found — run this from the repo root, or pass the path.")

    src = target.read_text(encoding="utf-8")

    if CANON_CHANNEL in src:
        stop("canon already points at its own channel — nothing to do.")

    if OLD_ENTRY not in src:
        stop(
            "the canon line in CHANNELS does not match what this patch expects.\n"
            "      Expected exactly:\n"
            f"      {OLD_ENTRY}\n"
            "      Someone has edited it; patch by hand or re-cut this script."
        )

    out = src.replace(OLD_ENTRY, NEW_ENTRY, 1)
    changed = ["CHANNELS.canon -> " + CANON_CHANNEL]

    # The two comment fixes are tidy-ups: warn, don't fail, if they've moved.
    if OLD_NOTE in out:
        out = out.replace(OLD_NOTE, NEW_NOTE, 1)
        changed.append("corrected the en_CA note above CHANNELS")
    else:
        print("note: the en_CA comment above CHANNELS did not match — left alone.")

    if OLD_LOCALE in out:
        out = out.replace(OLD_LOCALE, NEW_LOCALE, 1)
        changed.append("corrected the en_CA aside in the page-context note")
    else:
        print("note: the en_CA aside in the page-context note did not match — left alone.")

    target.write_text(out, encoding="utf-8")

    print("patched " + str(target))
    for line in changed:
        print("  - " + line)
    print("\nNow rebuild and deploy, then hard-refresh canon-sandbox.")


if __name__ == "__main__":
    main()
