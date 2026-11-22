"""Build the site and publish site/ to the gh-pages branch (GitHub Pages "deploy from a branch").

    uv run carbarometer-deploy             # build, commit to gh-pages, push to origin
    uv run carbarometer-deploy --no-push   # build and update the local gh-pages branch only
    uv run carbarometer-deploy --cname barometer.example.org   # custom domain

gh-pages is kept as a single commit (each deploy replaces it), so the repository doesn't grow with every
deploy. A .nojekyll file is added so Pages serves the files as-is instead of running them through Jekyll.
"""

from __future__ import annotations

import subprocess
import sys

from ghp_import import GhpError, ghp_import

from carbarometer.build_site import ROOT, SITE, build


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def source_ref() -> str:
    sha = git("rev-parse", "--short", "HEAD")
    if not sha:
        return "uncommitted sources"
    return sha + ("-dirty" if git("status", "--porcelain") else "")


def main() -> None:
    args = sys.argv[1:]
    push = "--no-push" not in args
    cname = args[args.index("--cname") + 1] if "--cname" in args else None

    if not (git("config", "user.name") and git("config", "user.email")):
        sys.exit(
            "deploy needs a git identity for the gh-pages commit. Set one, e.g.:\n"
            '  git config --global user.name "Your Name"\n'
            '  git config --global user.email "you@example.com"'
        )

    build()
    ref = source_ref()
    if ref.endswith("-dirty") or ref == "uncommitted sources":
        print("warning: deploying uncommitted changes", file=sys.stderr)
    # ghp-import only drops the old gh-pages commit when origin/gh-pages exists; drop the local one too so
    # the branch is always exactly one commit. It is generated output, never edited by hand.
    if git("rev-parse", "--verify", "--quiet", "refs/heads/gh-pages"):
        git("update-ref", "-d", "refs/heads/gh-pages")
    try:
        ghp_import(
            str(SITE),
            mesg=f"Deploy site from {ref}",
            nojekyll=True,
            cname=cname,
            no_history=True,
            push=push,
            remote="origin",
            branch="gh-pages",
        )
    except GhpError as e:
        sys.exit(f"deploy failed: {e.message}")
    print("pushed to origin/gh-pages" if push else "updated local gh-pages branch (not pushed)", file=sys.stderr)


if __name__ == "__main__":
    main()
