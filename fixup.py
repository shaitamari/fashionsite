#!/usr/bin/env python3
"""Apply the two outstanding fixes, then rebuild.

    python3 fixup.py

1. Removes `lifestyle`. It maps to none of the requested subverticals, and
   its footwear, home and pets content is now covered properly by fashion,
   home and electronics.

2. Configures `supermarket`. The catalog was pulled from a real store, but
   setup.py has not run since, so it has no config block — which is also why
   add_flows.py skipped it. Drops the generated gradient-card version first.

Then re-runs add_flows, shrink and build so everything is consistent.

Safe to run more than once.
"""
import glob, json, os, subprocess, sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))


def run(args, label):
    print(f"\n── {label} " + "─" * max(0, 56 - len(label)))
    r = subprocess.run([sys.executable] + args)
    if r.returncode != 0:
        print(f"  ! {label} exited {r.returncode}")
    return r.returncode == 0


def main():
    if not os.path.exists("verticals.json"):
        sys.exit("No verticals.json here — run this from the site folder.")

    # --- 1. lifestyle ------------------------------------------------------
    print("── removing lifestyle " + "─" * 39)
    cfg = json.load(open("verticals.json"))
    if cfg.pop("lifestyle", None):
        json.dump(cfg, open("verticals.json", "w"), indent=2)
        print("  removed from verticals.json")
    else:
        print("  already gone from verticals.json")

    removed = 0
    for f in (["catalogs/lifestyle.js", "feeds/lifestyle.xml"]
              + glob.glob("sources/lifestyle-*.json")):
        if os.path.exists(f):
            os.remove(f)
            removed += 1
    print(f"  {removed} file(s) deleted")

    # --- 2. supermarket ----------------------------------------------------
    print("\n── supermarket " + "─" * 46)
    borrowed = [f for f in glob.glob("sources/supermarket-*.json")
                if not f.endswith("supermarket-1.json")]
    if not borrowed:
        print("  ! no borrowed source files found — did the `hunt.py borrow` finish?")
        print("    skipping; run this again once it has.")
    else:
        # sources/supermarket-1.json is the generated gradient-card version.
        # The borrowed ones are numbered -101, -102 and so on.
        if os.path.exists("sources/supermarket-1.json"):
            os.remove("sources/supermarket-1.json")
            print("  dropped the generated version")
        print(f"  {len(borrowed)} borrowed source file(s) kept")
        run(["setup.py", "supermarket"], "setup.py supermarket")
        run(["shrink.py", "supermarket"], "shrink.py supermarket")

    # --- 3. rebuild --------------------------------------------------------
    run(["add_flows.py"], "add_flows.py")
    run(["build.py", "--all"], "build.py --all")

    print("\nDone. Check with:")
    print("  python3 build.py --list")
    print("  du -sh assets/img")


if __name__ == "__main__":
    main()
