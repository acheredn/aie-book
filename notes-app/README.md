# AI Engineering — Study Notes

A local, zero-dependency note-taking companion for reading *AI Engineering*
(Chip Huyen). Built on top of this repo's `ToC.md` and `chapter-summaries.md`.

## Run it

```bash
python3 server.py
```

Then open http://localhost:8420

## What it does

- Sidebar mirrors the book's real structure: chapter → section → subsection
  (parsed from `../ToC.md`), so you can jump straight to what you're reading.
- Each chapter page shows the author's own chapter summary
  (from `../chapter-summaries.md`) plus a collapsible list of her curated
  resources for that chapter (from `../resources.md`).
- Every node (chapter, section, or subsection) has its own **notes** box and
  **questions** list. Add a question when something doesn't click, come back
  later once you've read on or thought it through, and mark it answered.
- **Review open questions** (top of the sidebar) pulls every unanswered
  question across the whole book into one place — a running list of "things
  I still need to figure out," grouped by chapter.
- Small dot/number badges on the sidebar show at a glance which
  chapters/sections have notes or open questions, so you can resume where you
  left off.

## Data

Your notes live in `notes.json` next to this README — plain JSON, safe to
`git commit` so they're versioned and backed up with the rest of the fork.

## Re-syncing with the book

If you pull updates from upstream (`git pull upstream main`), re-run the
content parser to refresh `static/content.json`:

```bash
python3 build_content.py
```

Your notes in `notes.json` are keyed off chapter/section position, so as
long as the book's structure doesn't change, they'll line up automatically.
