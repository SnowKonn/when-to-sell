"""Build the calculator site: Korean at /, English at /en/.

Inputs : data/site.json, data/copy.json, data/vol.json, data/stocks.json, src/style.css, src/stoploss.js
Outputs: docs/  (index.html, en/index.html, assets/, robots.txt, sitemap.xml, .nojekyll)
No third-party packages. All links between the pages are relative, so the site works
at any path (GitHub project pages serve it under /<repository>/).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import shutil
from html import escape as e, unescape
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "docs"
SITE = json.loads((ROOT / "data" / "site.json").read_text())
COPY = json.loads((ROOT / "data" / "copy.json").read_text())
VOL = json.loads((ROOT / "data" / "vol.json").read_text())        # written by tools/update_vol.py
BASE = SITE["base_url"].rstrip("/")
TODAY = dt.date.today()
FONT_API = "https://fonts.googleapis.com/css2?family={family}&display=swap&text={text}"


def visible_text(markup: str) -> str:
    return unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", markup, flags=re.S))


def font_links(doc: str) -> str:
    """Google Fonts stylesheets cut down to the characters the page shows (one small file per weight).
    Characters outside the subset fall back to the system font."""
    ascii_ = {chr(c) for c in range(32, 127)}
    body = {c for c in visible_text(doc) if not c.isspace()} | ascii_
    heads = " ".join(visible_text(m) for m in re.findall(
        r"<(?:h1|h2|h3)\b.*?</(?:h1|h2|h3)>|<p class=\"lede\">.*?</p>", doc, flags=re.S))
    display = {c for c in heads if not c.isspace()} | ascii_
    pack = lambda chars: quote("".join(sorted(chars)))
    return "\n".join(
        f'<link rel="stylesheet" href="{e(FONT_API.format(family=fam, text=pack(chars)))}">'
        for fam, chars in (("Hahmlet:wght@300;400;600", display), ("IBM+Plex+Sans+KR:wght@400;500", body)))


def strings(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    return [x for v in (node.values() if isinstance(node, dict) else node) for x in strings(v)]


def _page(lang: str) -> str:
    t = COPY[lang]
    here, there, prefix = (("/", "en/", "") if lang == "ko" else ("/en/", "../", "../"))
    lang_switch = (f'<span aria-current="page">한국어</span><a href="{there}" lang="en" hreflang="en">English</a>'
                   if lang == "ko" else
                   f'<a href="{there}" lang="ko" hreflang="ko">한국어</a><span aria-current="page">English</span>')
    updated = f"{TODAY:%Y.%m.%d}" if lang == "ko" else f"{TODAY:%-d %B %Y}"
    items = lambda key: "".join(f"<li>{e(x)}</li>" for x in t[key])
    # text that the script writes later; listed here so that the font subset covers it
    glyphs = e(" ".join(strings(t["js"]) + [a[lang] for a in VOL["assets"]]))
    as_json = lambda obj: json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(t['title'])}</title>
<meta name="description" content="{e(t['description'])}">
<link rel="canonical" href="{BASE}{here}">
<link rel="alternate" hreflang="ko" href="{BASE}/">
<link rel="alternate" hreflang="en" href="{BASE}/en/">
<meta property="og:type" content="website">
<meta property="og:title" content="{e(t['title'])}">
<meta property="og:description" content="{e(t['description'])}">
<meta property="og:url" content="{BASE}{here}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
@@FONTS@@
<link rel="stylesheet" href="{prefix}assets/style.css">
</head>
<body>
<header class="masthead">
  <div class="wrap">
    <p class="series">{e(SITE['series'])}</p>
    <nav class="lang" aria-label="Language">{lang_switch}</nav>
  </div>
</header>

<div class="tool-head">
  <div class="wrap">
    <h1>{e(t['h1'])}</h1>
    <p class="lede">{e(t['lede'])}</p>
  </div>
</div>

<main class="wrap tool">
  <section id="inputs">
    <h2>{e(t['h_in'])}</h2>
    <div>
      <p>{e(t['in_note'])}</p>
      <form>
        <div class="search">
          <label for="stock">{e(t['f_stock'])}</label>
          <input id="stock" type="search" autocomplete="off" spellcheck="false" placeholder="{e(t['stock_ph'])}" data-src="{prefix}assets/stocks.json"
                 role="combobox" aria-expanded="false" aria-controls="stock-list" aria-autocomplete="list">
          <ul id="stock-list" role="listbox" aria-label="{e(t['f_stock'])}" hidden></ul>
          <p class="hint" id="stock-status" aria-live="polite">{e(t['stock_hint'])}</p>
        </div>
        <div class="fields">
          <div><label for="asset">{e(t['f_asset'])}</label><select id="asset"></select></div>
          <fieldset><legend>{e(t['f_window'])}</legend><div class="radios">
            <label><input type="radio" name="win" value="1y" checked> {e(t['w1'])}</label>
            <label><input type="radio" name="win" value="3y"> {e(t['w3'])}</label></div></fieldset>
          <div><label for="sigma">{e(t['f_sigma'])}</label><input id="sigma" type="number" value="30" min="1" max="300" step="0.1" inputmode="decimal"></div>
        </div>
        <p class="hint" id="vol-note" aria-live="polite"></p>
        <div class="scroll"><table class="in" id="sc">
          <caption>{e(t['sc_caption'])}</caption>
          <thead><tr><th>{e(t['js']['col_name'])}</th><th>{e(t['js']['col_p'])}</th><th>{e(t['js']['col_r'])}</th><th></th></tr></thead>
          <tbody></tbody>
        </table></div>
        <p class="actions"><button type="button" id="add">{e(t['add'])}</button></p>
        <p class="hint" id="psum" aria-live="polite"></p>
        <div class="fields">
          <div><label for="horizon">{e(t['f_horizon'])}</label><input id="horizon" type="number" value="1" min="0.1" max="30" step="0.25" inputmode="decimal"></div>
          <div><label for="entry">{e(t['f_entry'])}</label><input id="entry" type="number" min="0" step="any" inputmode="decimal" placeholder="{e(t['f_entry_ph'])}"></div>
        </div>
        <p>{e(t['now_in_note'])}</p>
        <div class="fields">
          <div><label for="cur">{e(t['f_cur'])}</label><input id="cur" type="number" min="0" step="any" inputmode="decimal" placeholder="{e(t['f_entry_ph'])}"></div>
          <div><label for="months">{e(t['f_months'])}</label><input id="months" type="number" min="0" step="1" inputmode="decimal" placeholder="{e(t['f_entry_ph'])}"></div>
        </div>
      </form>
    </div>
  </section>

  <section id="output">
    <h2>{e(t['h_out'])}</h2>
    <div id="result" aria-live="polite"></div>
  </section>

  <section id="now">
    <h2>{e(t['h_now'])}</h2>
    <div id="now-out" aria-live="polite"></div>
  </section>

  <section id="assumptions">
    <h2>{e(t['h_assume'])}</h2>
    <div>
      <ul class="plain">{items('assume')}</ul>
      <h3>{e(t['limits_h'])}</h3>
      <ul class="plain">{items('limits')}</ul>
      <p>{e(t['source'])} <a href="{e(SITE['note_url'])}">{e(t['source_link'])}</a></p>
      <p class="note">{e(t['vol_source'].replace('{d}', VOL['generated']))}</p>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <p>{e(t['disclaimer'])}</p>
    <p><a href="{e(SITE['profile_url'][lang])}">{e(t['back'])}</a> · <a href="{e(SITE['repo_url'])}" rel="noopener">GitHub</a> · {e(t['updated'])} {updated}</p>
  </div>
</footer>
<div hidden>{glyphs}</div>
<script type="application/json" id="i18n">{as_json(t['js'])}</script>
<script type="application/json" id="vol-data">{as_json(VOL)}</script>
<script src="{prefix}assets/stoploss.js" defer></script>
</body>
</html>
"""


def page(lang: str) -> str:
    doc = _page(lang)
    return doc.replace("@@FONTS@@", font_links(doc.replace("@@FONTS@@", "")), 1)


def main() -> None:
    shutil.rmtree(OUT, ignore_errors=True)
    (OUT / "assets").mkdir(parents=True)
    (OUT / "en").mkdir()
    for name in ("style.css", "stoploss.js"):
        shutil.copy(ROOT / "src" / name, OUT / "assets" / name)
    shutil.copy(ROOT / "data" / "stocks.json", OUT / "assets" / "stocks.json")   # fetched by the search box
    (OUT / "index.html").write_text(page("ko"))
    (OUT / "en" / "index.html").write_text(page("en"))
    (OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {BASE}/sitemap.xml\n")
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{BASE}{p}</loc><lastmod>{VOL['generated']}</lastmod></url>\n" for p in ("/", "/en/"))
        + "</urlset>\n")
    (OUT / ".nojekyll").write_text("")
    print(f"built {OUT}: volatility table of {VOL['generated']}, {len(VOL['assets'])} asset classes")


if __name__ == "__main__":
    main()
