#!/usr/bin/env python3
"""
Parses the aie-book repo's ToC.md, chapter-summaries.md and resources.md into
a single static/content.json consumed by the notes app frontend.

Re-run this after `git pull upstream main` to pick up any book updates:
    python3 build_content.py
"""
import html
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = Path(__file__).resolve().parent / "static" / "content.json"


def parse_toc(text):
    """Chapter -> [{title, page, subsections:[{title,page}]}]"""
    chapters = {}
    current_chapter = None
    current_section = None

    for line in text.splitlines():
        m = re.match(r"\|\s*\*\*(\d+)\.\s+(.*?)\*\*\s*\|\s*([\dix]+)\s*\|", line)
        if m:
            num, title, page = int(m.group(1)), m.group(2).strip(), m.group(3)
            current_chapter = {"num": num, "title": title, "page": page, "sections": []}
            chapters[num] = current_chapter
            current_section = None
            continue

        if current_chapter is None:
            continue

        m = re.match(r"\|\s*-\s+(.*?)\s*\|\s*([\dix]+)\s*\|", line)
        if m and current_section is not None:
            current_section["subsections"].append({"title": m.group(1).strip(), "page": m.group(2)})
            continue

        m = re.match(r"\|\s*([^-*|][^|]*?)\s*\|\s*([\dix]+)\s*\|", line)
        if m:
            title = m.group(1).strip()
            if title in ("Preface", "Epilogue", "Index"):
                current_chapter = None
                current_section = None
                continue
            current_section = {"title": title, "page": m.group(2), "subsections": []}
            current_chapter["sections"].append(current_section)

    return chapters


def md_inline(text):
    """Escape then apply minimal inline markdown: bold, italic, links, code."""
    text = html.escape(text)
    text = text.replace("&lt;br&gt;", "<br>")
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    return text


def md_block_to_html(block):
    lines = block.strip("\n").splitlines()
    if not lines:
        return ""
    stripped = block.strip()
    # raw HTML passthrough (e.g. <center><img ...></center>)
    if stripped.startswith("<"):
        return stripped
    # pipe table
    if lines[0].strip().startswith("|"):
        rows = [l for l in lines if l.strip().startswith("|")]
        if len(rows) >= 2 and re.match(r"^\|[\s:|-]+\|$", rows[1]):
            header_cells = [c.strip() for c in rows[0].strip("|").split("|")]
            body_rows = rows[2:]
            out = ["<table>", "<thead><tr>"]
            out += [f"<th>{md_inline(c)}</th>" for c in header_cells]
            out.append("</tr></thead><tbody>")
            for r in body_rows:
                cells = [c.strip() for c in r.strip("|").split("|")]
                out.append("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in cells) + "</tr>")
            out.append("</tbody></table>")
            return "".join(out)
    joined = " ".join(l.strip() for l in lines)
    cls = ' class="res-item"' if re.match(r"^\d+\.\s", joined) else ""
    return f"<p{cls}>" + md_inline(joined) + "</p>"


def md_to_html(text):
    blocks = re.split(r"\n\s*\n", text.strip())
    return "\n".join(md_block_to_html(b) for b in blocks if b.strip())


def parse_summaries(text):
    """Chapter num -> rendered HTML summary"""
    parts = re.split(r"^## Chapter (\d+)\.\s*(.*)$", text, flags=re.MULTILINE)
    # parts[0] is preamble; then triples of (num, title, body)
    summaries = {}
    for i in range(1, len(parts), 3):
        num = int(parts[i])
        body = parts[i + 2]
        summaries[num] = md_to_html(body)
    return summaries


def parse_resources(text):
    """Chapter num -> rendered HTML resource list (best-effort chapter matching)"""
    sections = re.split(r"^## (.*)$", text, flags=re.MULTILINE)
    resources = {}
    for i in range(1, len(sections), 2):
        heading = sections[i]
        body = sections[i + 1]
        nums = [int(n) for n in re.findall(r"Chapter[s]?\s+([\d\s+]+)\.", heading)[0].replace(" ", "").split("+")] \
            if re.search(r"Chapters?\s+[\d\s+]+\.", heading) else []
        if not nums:
            continue
        rendered = md_to_html(body)
        for n in nums:
            resources[n] = rendered
    return resources


def main():
    toc_text = (REPO_ROOT / "ToC.md").read_text()
    summaries_text = (REPO_ROOT / "chapter-summaries.md").read_text()
    resources_text = (REPO_ROOT / "resources.md").read_text()

    chapters = parse_toc(toc_text)
    summaries = parse_summaries(summaries_text)
    resources = parse_resources(resources_text)

    result = []
    for num in sorted(chapters):
        ch = chapters[num]
        ch["summary_html"] = summaries.get(num, "")
        ch["resources_html"] = resources.get(num, "")
        result.append(ch)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, indent=2))
    total_sections = sum(len(c["sections"]) for c in result)
    total_subsections = sum(len(s["subsections"]) for c in result for s in c["sections"])
    print(f"Wrote {OUT_PATH} — {len(result)} chapters, {total_sections} sections, {total_subsections} subsections")


if __name__ == "__main__":
    main()
