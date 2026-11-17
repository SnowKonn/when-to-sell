// Checks the calculation against the numbers of the study note (Part I). Run: node tests/check.js
const c = require("../src/stoploss.js");
const near = (got, want, tol, what) => {
  if (!(Math.abs(got - want) <= tol)) { console.error(`FAIL ${what}: got ${got}, want ${want}`); process.exitCode = 1; }
  else console.log(`ok   ${what}: ${got.toFixed(4)}`);
};
const table = [{ p: 40, R: 0.40 }, { p: 40, R: 0.10 }, { p: 20, R: -0.35 }];

// running example of the note, volatility 30%: stop 25.1% below entry, growth 8.51% against 4.16%
let S = c.setup(table, 0.30, 1), b = c.best(S);
near(Math.exp(-b.a) - 1, -0.2507, 5e-4, "running example, stop");
near(b.g, 0.08508, 5e-5, "running example, growth with the stop");
near(b.none, 0.04156, 5e-5, "running example, growth without a stop");
const h = c.hit(S, b.a);
near(h[0], 0.0754, 5e-4, "probability of the stop, up scenario");
near(h[2], 0.5954, 5e-4, "probability of the stop, down scenario");

// other volatilities of the same table
near(Math.exp(-c.best(c.setup(table, 0.20, 1)).a) - 1, -0.1693, 5e-4, "volatility 20%, stop");
near(Math.exp(-c.best(c.setup(table, 0.50, 1)).a) - 1, -0.2201, 5e-4, "volatility 50%, stop");
if (c.best(c.setup(table, 0.70, 1)).kind !== "avoid") { console.error("FAIL volatility 70%: expected 'avoid'"); process.exitCode = 1; } else console.log("ok   volatility 70%: not held");

// two symmetric scenarios (probability 70%, compound rates +-30%, volatility 50%): closed form of the note
const m = 0.3, s = 0.5, w = Math.sqrt(m * m + 2 * s * s);
const closed = (s * s / (2 * m)) * (Math.log(0.7 / 0.3) + Math.log((w + m) / (w - m)));
S = c.setup([{ p: 70, R: Math.exp(m + s * s / 2) - 1 }, { p: 30, R: Math.exp(-m + s * s / 2) - 1 }], s, 1); b = c.best(S);
near(b.a, closed, 1e-5, "two scenarios, stop against the closed form");
near(b.g, 0.13371, 5e-5, "two scenarios, growth with the stop");

// posterior after a fall of 18% in three months, volatility 30%: 19 / 37 / 43
const q = c.posterior(c.setup(table, 0.30, 1), 0.30, Math.log(0.82), 0.25).q;
near(q[0], 0.19, 0.006, "posterior, up"); near(q[1], 0.37, 0.006, "posterior, middle"); near(q[2], 0.43, 0.006, "posterior, down");

// every scenario positive: no stop
if (c.best(c.setup([{ p: 50, R: 0.3 }, { p: 50, R: 0.1 }], 0.2, 1)).kind !== "none") { console.error("FAIL all positive: expected 'none'"); process.exitCode = 1; } else console.log("ok   all scenarios positive: no stop");
