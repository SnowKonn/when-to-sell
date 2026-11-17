/* Stop-loss calculator. The formulas are those of the study note
   "When do stop-loss and take-profit rules maximize long-run growth? Part I" (whole account in the
   position, return earned as a rate, exponential horizon with mean T, sale not undone, cash after a sale).

   Scenario s: probability p_s, expected simple return R_s over T years, volatility sigma (per year).
     alpha_s = log(1 + R_s) / T                       arithmetic rate
     mu_s    = alpha_s - sigma^2 / 2                  compound rate
     gamma_s = (mu_s + sqrt(mu_s^2 + 2 sigma^2 / T)) / sigma^2
     P_s(a)  = exp(-gamma_s a)                        probability that a stop at log distance a is reached
     g(a)    = sum_s p_s mu_s (1 - P_s(a))            expected growth per year of the view
   The best fixed stop maximizes g. No stop is a = infinity, g = sum_s p_s mu_s.
   Posterior after a log return x at time t: q_s ~ p_s exp(mu_s x / sigma^2 - mu_s^2 t / (2 sigma^2)). */
(() => {
  "use strict";

  function setup(scenarios, sigma, T) {
    const total = scenarios.reduce((a, s) => a + s.p, 0);
    const s2 = sigma * sigma;
    return scenarios.map((s) => {
      const alpha = Math.log(1 + s.R) / T;
      const mu = alpha - s2 / 2;
      return { name: s.name, p: s.p / total, R: s.R, alpha, mu, gamma: (mu + Math.sqrt(mu * mu + (2 * s2) / T)) / s2 };
    });
  }
  const growth = (S, a) => S.reduce((acc, s) => acc + s.p * s.mu * (1 - Math.exp(-s.gamma * a)), 0);
  const noStop = (S) => S.reduce((acc, s) => acc + s.p * s.mu, 0);
  const hit = (S, a) => S.map((s) => Math.exp(-s.gamma * a));

  // Best fixed stop: grid search on the log distance, then golden-section refinement.
  function best(S) {
    const none = noStop(S);
    const A_MAX = 5, STEP = 0.001;                  // exp(-5): a fall of 99.3%
    let a0 = STEP, g0 = growth(S, STEP);
    for (let a = STEP; a <= A_MAX; a += STEP) { const g = growth(S, a); if (g > g0) { g0 = g; a0 = a; } }
    let lo = Math.max(a0 - STEP, 1e-9), hi = a0 + STEP;
    const k = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 60; i++) {
      const x1 = hi - k * (hi - lo), x2 = lo + k * (hi - lo);
      if (growth(S, x1) > growth(S, x2)) hi = x2; else lo = x1;
    }
    const a = (lo + hi) / 2, g = growth(S, a);
    if (Math.max(g, none) <= 1e-9) return { kind: "avoid", a: 0, g: 0, none };
    if (none >= g - 1e-7 || a > A_MAX - 2 * STEP) return { kind: "none", a: Infinity, g: none, none };
    return { kind: "stop", a, g, none };
  }

  function posterior(S, sigma, x, t) {
    const s2 = sigma * sigma;
    const w = S.map((s) => s.p * Math.exp((s.mu * x) / s2 - (s.mu * s.mu * t) / (2 * s2)));
    const sum = w.reduce((a, b) => a + b, 0);
    const q = w.map((v) => v / sum);
    return { q, D: q.reduce((acc, v, i) => acc + v * S[i].mu, 0) };
  }

  // Stock search. rows: [ticker, ko, en, market, vol_1y, vol_3y, last]. Matches the ticker, the code
  // without its suffix, and either name; a match at the start ranks above a match inside.
  function searchStocks(rows, query, limit = 8) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    for (const r of rows) {
      const t = r[0].toLowerCase(), ko = r[1].toLowerCase(), en = r[2].toLowerCase();
      let s = -1;
      if (t === q || t.split(".")[0] === q || ko === q || en === q) s = 0;
      else if (t.startsWith(q) || ko.startsWith(q) || en.startsWith(q)) s = 1;
      else if (en.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) s = 2;
      else if (ko.includes(q) || en.includes(q) || t.includes(q)) s = 3;
      // within a rank, the shortest name that contains the query comes first
      if (s >= 0) scored.push([s, ko.includes(q) ? ko.length : en.includes(q) ? en.length : t.length, r]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.slice(0, limit).map((x) => x[2]);
  }

  const core = { setup, growth, noStop, hit, best, posterior, searchStocks };
  if (typeof module !== "undefined" && module.exports) { module.exports = core; return; }

  // ---------------------------------------------------------------- page
  const $ = (id) => document.getElementById(id);
  const T_ = JSON.parse($("i18n").textContent);
  const VOL = JSON.parse($("vol-data").textContent);
  const lang = document.documentElement.lang;
  const num = (v, d = 1) => v.toLocaleString(lang === "ko" ? "ko-KR" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v) * 100, d) + "%";
  const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const DEFAULTS = [
    { name: T_.up, p: 40, R: 40 },
    { name: T_.mid, p: 40, R: 10 },
    { name: T_.down, p: 20, R: -35 },
  ];

  function rowHtml(s) {
    return `<tr>
      <td><input type="text" class="s-name" value="${esc(s.name)}" aria-label="${esc(T_.col_name)}"></td>
      <td><input type="number" class="s-p" value="${s.p}" min="0" max="100" step="1" inputmode="decimal" aria-label="${esc(T_.col_p)}"></td>
      <td><input type="number" class="s-r" value="${s.R}" min="-99" step="1" inputmode="decimal" aria-label="${esc(T_.col_r)}"></td>
      <td><button type="button" class="del" aria-label="${esc(T_.remove)}">×</button></td>
    </tr>`;
  }

  function read() {
    const rows = [...document.querySelectorAll("#sc tbody tr")].map((tr) => ({
      name: tr.querySelector(".s-name").value.trim() || "—",
      p: parseFloat(tr.querySelector(".s-p").value),
      R: parseFloat(tr.querySelector(".s-r").value) / 100,
    }));
    const sigma = parseFloat($("sigma").value) / 100;
    const T = parseFloat($("horizon").value);
    const entry = parseFloat($("entry").value);
    const errors = [];
    if (rows.length < 2) errors.push(T_.err_rows);
    if (rows.some((r) => !(r.p >= 0) || !isFinite(r.R))) errors.push(T_.err_number);
    else if (!(rows.reduce((a, r) => a + r.p, 0) > 0)) errors.push(T_.err_prob);
    if (rows.some((r) => r.R <= -1)) errors.push(T_.err_return);
    if (!(sigma > 0 && sigma <= 3)) errors.push(T_.err_sigma);
    if (!(T > 0 && T <= 30)) errors.push(T_.err_horizon);
    const psum = rows.reduce((a, r) => a + (r.p || 0), 0);
    return { rows, sigma, T, entry: entry > 0 ? entry : null, errors, psum };
  }

  function chart(S, b) {
    const W = 640, H = 250, L = 52, R = 30, TOP = 14, B = 40;
    const xmax = 0.8;                                    // stops from 0% to -80%
    const pts = [];
    for (let i = 1; i <= 200; i++) { const d = (xmax * i) / 200; pts.push([d, growth(S, -Math.log(1 - d))]); }
    const ys = pts.map((p) => p[1]).concat([b.none, 0]);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.12 || 0.01; y0 -= pad; y1 += pad;
    const X = (d) => L + ((W - L - R) * d) / xmax, Y = (g) => TOP + ((H - TOP - B) * (y1 - g)) / (y1 - y0);
    const path = pts.map((p, i) => (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1)).join(" ");
    const step = [0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5].find((s) => (y1 - y0) / s <= 6) || 1;
    let grid = "";
    for (let g = Math.ceil(y0 / step) * step; g <= y1; g += step)
      grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(g).toFixed(1)}" y2="${Y(g).toFixed(1)}"/><text class="tick" x="${L - 8}" y="${(Y(g) + 4).toFixed(1)}" text-anchor="end">${num(Math.abs(g) < 1e-9 ? 0 : g * 100, step < 0.01 ? 1 : 0)}%</text>`;
    let xt = "";
    for (let d = 0; d <= xmax + 1e-9; d += 0.2)
      xt += `<text class="tick" x="${X(d).toFixed(1)}" y="${H - B + 18}" text-anchor="middle">${d ? "−" + Math.round(d * 100) + "%" : "0%"}</text>`;
    const none = `<line class="none" x1="${L}" x2="${W - R}" y1="${Y(b.none).toFixed(1)}" y2="${Y(b.none).toFixed(1)}"/><text class="lab" x="${W - R}" y="${(Y(b.none) + (pts[pts.length - 1][1] > b.none ? 16 : -7)).toFixed(1)}" text-anchor="end">${esc(T_.chart_none)}</text>`;
    let mark = "";
    if (b.kind === "stop") {
      const d = 1 - Math.exp(-b.a);
      if (d <= xmax) mark = `<line class="at" x1="${X(d).toFixed(1)}" x2="${X(d).toFixed(1)}" y1="${Y(b.g).toFixed(1)}" y2="${H - B}"/><circle class="dot" cx="${X(d).toFixed(1)}" cy="${Y(b.g).toFixed(1)}" r="4.5"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T_.chart_alt)}">${grid}${xt}
      <text class="lab axis-title" x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${esc(T_.chart_x)}</text>
      ${none}<path class="curve" d="${path}"/>${mark}</svg>`;
  }

  function render() {
    const inp = read();
    $("psum").textContent = fill(T_.psum, { n: num(inp.psum, 0) });
    $("psum").classList.toggle("warn", Math.abs(inp.psum - 100) > 0.5);
    const out = $("result"), now = $("now-out");
    if (inp.errors.length) {
      out.innerHTML = `<p class="error">${inp.errors.map(esc).join("<br>")}</p>`;
      now.innerHTML = "";
      return;
    }
    const S = setup(inp.rows, inp.sigma, inp.T), b = best(S);
    const stopPct = b.kind === "stop" ? Math.exp(-b.a) - 1 : null;
    let head;
    if (b.kind === "stop") {
      const price = inp.entry ? `<span class="sub">${esc(fill(T_.stop_price, { p: num(inp.entry * Math.exp(-b.a), inp.entry < 100 ? 2 : 0) }))}</span>` : "";
      head = `<p class="big">${esc(T_.stop_label)} <strong>${pct(stopPct)}</strong>${price}</p>`;
    } else if (b.kind === "none") head = `<p class="big"><strong>${esc(T_.no_stop)}</strong></p><p>${esc(T_.no_stop_why)}</p>`;
    else head = `<p class="big"><strong>${esc(T_.avoid)}</strong></p><p>${esc(T_.avoid_why)}</p>`;

    const ph = b.kind === "stop" ? hit(S, b.a) : S.map(() => 0);
    const pall = ph.reduce((acc, v, i) => acc + v * S[i].p, 0);
    const facts = b.kind === "avoid" ? "" : `<dl class="facts">
        <div><dt>${esc(T_.g_none)}</dt><dd>${pct(b.none)}</dd></div>
        ${b.kind === "stop" ? `<div><dt>${esc(T_.g_stop)}</dt><dd>${pct(b.g)}</dd></div>
        <div><dt>${esc(T_.p_stop)}</dt><dd>${num(pall * 100, 0)}%</dd></div>` : ""}
      </dl>`;
    const rows = S.map((s, i) => `<tr><th scope="row">${esc(s.name)}</th><td>${num(s.p * 100, 0)}%</td><td>${pct(s.R)}</td><td>${pct(s.mu)}</td><td>${b.kind === "stop" ? num(ph[i] * 100, 0) + "%" : "—"}</td></tr>`).join("");
    out.innerHTML = `${head}${facts}
      <figure>${chart(S, b)}<figcaption>${esc(T_.chart_cap)}</figcaption></figure>
      <div class="scroll"><table class="out">
        <thead><tr><th>${esc(T_.col_name)}</th><th>${esc(T_.col_p_out)}</th><th>${esc(T_.col_r_out)}</th><th>${esc(T_.col_mu)}</th><th>${esc(T_.col_hit)}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="note">${esc(T_.mu_note)}</p>`;

    // where the position stands now
    const cur = parseFloat($("cur").value), months = parseFloat($("months").value);
    if (!(inp.entry && cur > 0 && months >= 0)) { now.innerHTML = `<p class="note">${esc(T_.now_hint)}</p>`; return; }
    const x = Math.log(cur / inp.entry), post = posterior(S, inp.sigma, x, months / 12);
    const prow = S.map((s, i) => `<tr><th scope="row">${esc(s.name)}</th><td>${num(s.p * 100, 0)}%</td><td>${num(post.q[i] * 100, 0)}%</td></tr>`).join("");
    let line = "";
    if (b.kind === "stop") {
      const stopPrice = inp.entry * Math.exp(-b.a);
      line = cur <= stopPrice ? T_.now_below : fill(T_.now_above, { d: num((1 - stopPrice / cur) * 100, 1) });
    }
    now.innerHTML = `<dl class="facts">
        <div><dt>${esc(T_.now_ret)}</dt><dd>${pct(cur / inp.entry - 1)}</dd></div>
        <div><dt>${esc(T_.now_D)}</dt><dd>${pct(post.D)}</dd></div>
      </dl>
      <div class="scroll"><table class="out"><thead><tr><th>${esc(T_.col_name)}</th><th>${esc(T_.now_prior)}</th><th>${esc(T_.now_post)}</th></tr></thead><tbody>${prow}</tbody></table></div>
      ${line ? `<p>${esc(line)}</p>` : ""}<p class="note">${esc(T_.now_note)}</p>`;
  }

  // volatility presets
  const sel = $("asset");
  const groups = {};
  for (const a of VOL.assets) (groups[a.group] = groups[a.group] || []).push(a);
  sel.innerHTML = `<option value="">${esc(T_.manual)}</option>` + Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(T_.groups[g] || g)}">${list.map((a) => `<option value="${a.id}">${esc(a[lang] || a.en)}</option>`).join("")}</optgroup>`).join("");
  let picked = null;                                   // { name, vol_1y, vol_3y, last } of the chosen asset class or stock
  function applyPicked() {
    const w = document.querySelector('input[name="win"]:checked').value;
    const v = picked && (picked["vol_" + w] ?? picked.vol_1y);
    if (v) $("sigma").value = (v * 100).toFixed(1);
    $("vol-note").textContent = picked
      ? fill(T_.vol_note, { name: picked.name, y1: num(picked.vol_1y * 100, 1), y3: picked.vol_3y ? num(picked.vol_3y * 100, 1) : "—", d: picked.last })
      : T_.vol_manual;
    render();
  }
  sel.addEventListener("change", () => {
    const a = VOL.assets.find((v) => v.id === sel.value);
    picked = a ? { name: a[lang] || a.en, vol_1y: a.vol_1y, vol_3y: a.vol_3y, last: a.last } : null;
    box.value = ""; closeList();
    applyPicked();
  });
  for (const r of document.querySelectorAll('input[name="win"]')) r.addEventListener("change", applyPicked);
  $("sigma").addEventListener("input", () => { picked = null; sel.value = ""; box.value = ""; $("vol-note").textContent = T_.vol_manual; });

  // stock search: the table is fetched the first time the box is used
  const box = $("stock"), list = $("stock-list"), status = $("stock-status");
  let stocks = null, loading = null, shown = [], active = -1;
  const nameOf = (r) => (lang === "ko" ? r[1] : r[2]);
  function load() {
    if (stocks || loading) return loading;
    status.textContent = T_.stock_loading;
    loading = fetch(box.dataset.src).then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then((doc) => { stocks = doc.rows; status.textContent = fill(T_.stock_count, { n: num(stocks.length, 0), d: doc.generated }); suggest(); })
      .catch(() => { loading = null; status.textContent = T_.stock_fail; });
    return loading;
  }
  function closeList() { list.hidden = true; list.innerHTML = ""; shown = []; active = -1; box.setAttribute("aria-expanded", "false"); box.removeAttribute("aria-activedescendant"); }
  function mark(i) {
    active = i;
    [...list.children].forEach((li, k) => li.setAttribute("aria-selected", k === i));
    if (i >= 0) box.setAttribute("aria-activedescendant", "stock-opt-" + i); else box.removeAttribute("aria-activedescendant");
  }
  function suggest() {
    if (!stocks || document.activeElement !== box) return;
    shown = searchStocks(stocks, box.value);
    if (!box.value.trim()) return closeList();
    list.innerHTML = shown.length
      ? shown.map((r, i) => `<li role="option" id="stock-opt-${i}" data-i="${i}" aria-selected="false"><span class="nm">${esc(nameOf(r))}</span><span class="tk">${esc(r[0])} · ${esc(T_.markets[r[3]] || r[3])}</span><span class="vl">${num(r[4] * 100, 1)}%</span></li>`).join("")
      : `<li class="none">${esc(T_.stock_none)}</li>`;
    list.hidden = false; box.setAttribute("aria-expanded", "true"); mark(shown.length ? 0 : -1);
  }
  function choose(i) {
    const r = shown[i];
    if (!r) return;
    picked = { name: `${nameOf(r)} (${r[0]})`, vol_1y: r[4], vol_3y: r[5], last: r[6] };
    box.value = nameOf(r); sel.value = ""; closeList();
    applyPicked();
  }
  box.addEventListener("focus", load);
  box.addEventListener("input", (e) => { e.stopPropagation(); load(); suggest(); });
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && shown.length) { e.preventDefault(); mark((active + 1) % shown.length); }
    else if (e.key === "ArrowUp" && shown.length) { e.preventDefault(); mark((active - 1 + shown.length) % shown.length); }
    else if (e.key === "Enter") { e.preventDefault(); if (active >= 0) choose(active); }
    else if (e.key === "Escape") closeList();
  });
  list.addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
  box.addEventListener("blur", () => setTimeout(closeList, 120));

  const body = document.querySelector("#sc tbody");
  body.innerHTML = DEFAULTS.map(rowHtml).join("");
  $("add").addEventListener("click", () => { body.insertAdjacentHTML("beforeend", rowHtml({ name: "", p: 0, R: 0 })); render(); });
  body.addEventListener("click", (e) => { const d = e.target.closest(".del"); if (d && body.rows.length > 2) { d.closest("tr").remove(); render(); } });
  document.querySelector("form").addEventListener("input", render);
  document.querySelector("form").addEventListener("submit", (e) => e.preventDefault());
  $("vol-note").textContent = T_.vol_manual;
  render();
})();
