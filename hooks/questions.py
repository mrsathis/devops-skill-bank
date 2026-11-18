"""MkDocs hook: builds assets/data/questions.json from the interview-prep pages.

Every bold question paragraph (company and topic pages) and every `###` heading on the
core-answers page becomes one practice card. The JSON powers the home page widgets,
the Practice page and the "practised" tracker. Runs on every build, so new questions
appear automatically.
"""
import json
import os
import posixpath
import re

import markdown

QUESTIONS = []
MAX_ANSWER_CHARS = 1800

LINK_RE = re.compile(r"\]\(([^)\s]+?\.md)(#[^)\s]+)?\)")


def slugify(text: str) -> str:
    """Must match slugify() in docs/javascripts/skillbank.js."""
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)      # keep link text only
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return "q-" + text[:60].rstrip("-")


def page_url(src_path: str) -> str:
    """docs-relative .md path -> site-relative URL with directory URLs."""
    p = src_path[:-3]
    if p.endswith("index"):
        p = p[: -len("index")]
    elif not p.endswith("/"):
        p += "/"
    return p


def absolutise_links(md_text: str, src_path: str) -> str:
    base_dir = posixpath.dirname(src_path)

    def repl(m):
        target = posixpath.normpath(posixpath.join(base_dir, m.group(1)))
        return "](" + page_url(target) + (m.group(2) or "") + ")"

    return LINK_RE.sub(repl, md_text)


def truncate(md_text: str) -> tuple[str, bool]:
    if len(md_text) <= MAX_ANSWER_CHARS:
        return md_text, False
    cut = md_text.rfind("\n\n", 0, MAX_ANSWER_CHARS)
    if cut < 400:
        cut = md_text.rfind(". ", 0, MAX_ANSWER_CHARS) + 1
    # never leave an open code fence
    head = md_text[:cut]
    if head.count("```") % 2:
        head = head[: head.rfind("```")]
    return head.rstrip(), True


def render(md_text: str) -> str:
    return markdown.markdown(
        md_text,
        extensions=["fenced_code", "tables", "sane_lists", "def_list"],
    )


def category_for(src_path: str) -> tuple[str, str]:
    name = posixpath.basename(src_path)[:-3]
    if "/companies/" in src_path:
        return "company", name
    if "/topics/" in src_path:
        return "topic", name
    return "core", "core"


def parse_page(src_path: str, text: str, title_map: dict):
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)  # front matter
    page_title = (re.search(r"^# (.+)$", text, re.M) or [None, src_path])[1]
    kind, key = category_for(src_path)
    url = page_url(src_path)
    lines = text.split("\n")
    items = []

    if kind == "core":
        section = ""
        current = None
        for line in lines:
            h2 = re.match(r"^## (.+)$", line)
            h3 = re.match(r"^### (.+?)(?:\s*\{#([\w-]+)\})?\s*$", line)
            if h2:
                section = h2.group(1).strip()
                if current:
                    items.append(current)
                current = None
            elif h3:
                if current:
                    items.append(current)
                anchor = h3.group(2) or slugify(h3.group(1))
                current = {"q": h3.group(1).strip(), "a": [], "anchor": anchor, "section": section}
            elif current is not None:
                current["a"].append(line)
        if current:
            items.append(current)
    else:
        section = ""
        current = None
        in_fence = False
        for line in lines:
            if line.startswith("```"):
                in_fence = not in_fence
            if not in_fence and re.match(r"^#{2,3} ", line):
                if current:
                    items.append(current)
                current = None
                section = line.lstrip("#").strip()
                continue
            m = None if in_fence else re.match(r"^\*\*(.+?)\*\*(.*)$", line)
            if m and len(m.group(1)) > 12 and not m.group(1).endswith(":"):
                if current:
                    items.append(current)
                current = {"q": m.group(1).strip(), "a": [m.group(2).strip()],
                           "anchor": slugify(m.group(1)), "section": section}
            elif current is not None:
                current["a"].append(line)
        if current:
            items.append(current)

    for it in items:
        answer_md = "\n".join(it["a"]).strip()
        if not answer_md:
            continue
        answer_md = absolutise_links(answer_md, src_path)
        short, truncated = truncate(answer_md)
        QUESTIONS.append({
            "id": url + "#" + it["anchor"],
            "q": re.sub(r"`([^`]*)`", r"\1", it["q"]),
            "a": render(short),
            "more": truncated,
            "url": url + "#" + it["anchor"],
            "page": page_title,
            "section": it["section"],
            "kind": kind,
            "key": key,
        })


def on_files(files, config):
    QUESTIONS.clear()
    titles = {}
    for f in files:
        if f.src_uri.startswith("interview-prep/") and f.src_uri.endswith(".md") \
                and not f.src_uri.endswith("index.md"):
            with open(f.abs_src_path, encoding="utf-8") as fh:
                parse_page(f.src_uri, fh.read(), titles)
    return files


def on_post_build(config):
    out_dir = os.path.join(config["site_dir"], "assets", "data")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "questions.json"), "w", encoding="utf-8") as fh:
        json.dump({"count": len(QUESTIONS), "questions": QUESTIONS}, fh, ensure_ascii=False,
                  separators=(",", ":"))
