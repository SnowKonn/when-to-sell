// Checks the calculation against the numbers of the study note (Part I). Run: node tests/check.js
const c = require("../src/stoploss.js");
const near = (got, want, tol, what) => {
  if (!(Math.abs(got - want) <= tol)) { console.error(`FAIL ${what}: got ${got}, want ${want}`); process.exitCode = 1; }
  else console.log(`ok   ${what}: ${got.toFixed(4)}`);
};
const table = [{ p: 40, R: 0.40 }, { p: 40, R: 0.10 }, { p: 20, R: -0.35 }];

// The table read as compound returns (the default of setup(); the page defaults to "mean"). Reference values from an independent
// implementation (numpy, scipy): compound rates 33.65%, 9.53%, -43.08%; mean 8.66%.
let S = c.setup(table, 0.30, 1), b = c.best(S);
near(S[0].mu, 0.33647, 1e-5, "compound rate, up scenario");
near(b.none, 0.08656, 1e-5, "volatility 30%, growth without a stop");
near(Math.exp(-b.a) - 1, -0.2767, 5e-4, "volatility 30%, stop");
near(b.g, 0.12127, 5e-5, "volatility 30%, growth with the stop");
const h = c.hit(S, b.a);
near(h[0], 0.0424, 5e-4, "probability of the stop, up scenario");
near(h[2], 0.5349, 5e-4, "probability of the stop, down scenario");
near(Math.exp(-c.best(c.setup(table, 0.20, 1)).a) - 1, -0.1738, 5e-4, "volatility 20%, stop");
near(Math.exp(-c.best(c.setup(table, 0.50, 1)).a) - 1, -0.4742, 5e-4, "volatility 50%, stop");
near(c.best(c.setup(table, 0.757, 1)).g, 0.09589, 5e-5, "volatility 75.7%, growth with the stop");

// posterior after a fall of 18% in three months, volatility 30%: 18 / 36 / 45
const q = c.posterior(c.setup(table, 0.30, 1), 0.30, Math.log(0.82), 0.25).q;
near(q[0], 0.1844, 5e-4, "posterior, up"); near(q[1], 0.3627, 5e-4, "posterior, middle"); near(q[2], 0.4528, 5e-4, "posterior, down");

// The same table read as expected values (mode "mean"): the default of the page; the numbers of the study note (v4.2, v6.0)
S = c.setup(table, 0.30, 1, "mean"); b = c.best(S);
near(Math.exp(-b.a) - 1, -0.2507, 5e-4, "expected-value reading, stop");
near(b.g, 0.08508, 5e-5, "expected-value reading, growth with the stop");
near(b.none, 0.04156, 5e-5, "expected-value reading, growth without a stop");
if (c.best(c.setup(table, 0.70, 1, "mean")).kind !== "avoid") { console.error("FAIL expected-value reading, volatility 70%: expected 'avoid'"); process.exitCode = 1; } else console.log("ok   expected-value reading, volatility 70%: not held");

// two symmetric scenarios (probability 70%, compound rates +-30%, volatility 50%): closed form of the note
const m = 0.3, s = 0.5, w = Math.sqrt(m * m + 2 * s * s);
const closed = (s * s / (2 * m)) * (Math.log(0.7 / 0.3) + Math.log((w + m) / (w - m)));
S = c.setup([{ p: 70, R: Math.exp(m) - 1 }, { p: 30, R: Math.exp(-m) - 1 }], s, 1); b = c.best(S);
near(b.a, closed, 1e-5, "two scenarios, stop against the closed form");
near(b.g, 0.13371, 5e-5, "two scenarios, growth with the stop");

// every scenario positive: no stop; every scenario negative: not held
if (c.best(c.setup([{ p: 50, R: 0.3 }, { p: 50, R: 0.1 }], 0.2, 1)).kind !== "none") { console.error("FAIL all positive: expected 'none'"); process.exitCode = 1; } else console.log("ok   all scenarios positive: no stop");
if (c.best(c.setup([{ p: 50, R: -0.3 }, { p: 50, R: -0.1 }], 0.2, 1)).kind !== "avoid") { console.error("FAIL all negative: expected 'avoid'"); process.exitCode = 1; } else console.log("ok   all scenarios negative: not held");

// stock search: exact code first, then names that start with the query, then names that contain it
const rows = [["005930.KS", "삼성전자", "Samsung Electronics", "KS", 0.4, 0.3, "2026-11-17"], ["005935.KS", "삼성전자우", "Samsung Electronics Pref", "KS", 0.35, 0.28, "2026-11-17"],
  ["006400.KS", "삼성SDI", "Samsung SDI", "KS", 0.5, 0.45, "2026-11-17"], ["NVDA", "Nvidia", "Nvidia", "US", 0.45, 0.5, "2026-11-17"], ["207940.KS", "삼성바이오로직스", "Samsung Biologics", "KS", 0.3, 0.3, "2026-11-17"]];
const first = (q) => (c.searchStocks(rows, q)[0] || [])[0];
for (const [q, want] of [["005930", "005930.KS"], ["삼성전자", "005930.KS"], ["nvda", "NVDA"], ["nvid", "NVDA"], ["sdi", "006400.KS"], ["바이오", "207940.KS"]]) {
  if (first(q) !== want) { console.error(`FAIL search "${q}": got ${first(q)}, want ${want}`); process.exitCode = 1; } else console.log(`ok   search "${q}" -> ${want}`);
}
if (c.searchStocks(rows, "삼성").length !== 4 || c.searchStocks(rows, "  ").length !== 0 || c.searchStocks(rows, "zzz").length !== 0) { console.error("FAIL search counts"); process.exitCode = 1; } else console.log("ok   search counts");
{ const r2 = [["098120.KQ", "마이크로컨텍솔", "Micro Contact Solution", "KQ", 1, 1, "x"], ["MSFT", "Microsoft", "Microsoft", "US", 0.2, 0.2, "x"], ["MU", "Micron Technology", "Micron Technology", "US", 0.5, 0.5, "x"]];
  const got = c.searchStocks(r2, "micro")[0][0];
  if (got !== "MSFT") { console.error(`FAIL search "micro": got ${got}, want MSFT`); process.exitCode = 1; } else console.log('ok   search "micro" -> MSFT'); }
