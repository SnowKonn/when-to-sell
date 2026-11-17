"""Volatility estimates for individual stocks, for the search box of the calculator.

Input : data/stocks_universe.csv  (ticker, Korean name, English name, market)
Output: data/stocks.json          (compact rows: ticker, ko, en, market, vol 1y, vol 3y, last date)

Same method as tools/update_vol.py: daily closes from Yahoo Finance through yfinance, sample
standard deviation of daily log returns over the last 252 and the last 756 observations,
annualized with the number of observations per year measured from the dates. A stock with fewer
than 253 closes, with no trade in the last ten days, or with a measured volatility above 300% a
year (a trading halt or an unadjusted corporate action) is left out. If a download fails the previous value of that stock is kept; if
fewer than 60% of the stocks come back, the file is left unchanged and the script fails.
Needs: pip install yfinance.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "stocks.json"
BATCH = 150


def vol(closes: list[float], n: int, per_year: float) -> float | None:
    if len(closes) < n + 1:
        return None
    r = [math.log(b / a) for a, b in zip(closes[-n - 1:-1], closes[-n:]) if a > 0 and b > 0]
    if len(r) < 0.9 * n:
        return None
    m = sum(r) / len(r)
    return math.sqrt(sum((x - m) ** 2 for x in r) / (len(r) - 1) * per_year)


def fetch(tickers: list[str]) -> dict[str, tuple]:
    """ticker -> (vol_1y, vol_3y, last date) for the tickers that came back with enough history."""
    got = {}
    df = yf.download(tickers, period="4y", interval="1d", auto_adjust=True, group_by="ticker",
                     threads=True, progress=False)
    for t in tickers:
        try:
            c = (df[t]["Close"] if len(tickers) > 1 else df["Close"]).dropna()
        except KeyError:
            continue
        if hasattr(c, "columns"):                    # a single-ticker frame can come back two-dimensional
            c = c.iloc[:, 0]
        if len(c) < 253:
            continue
        per_year = (len(c) - 1) / ((c.index[-1] - c.index[0]).days / 365.25)
        closes = [float(x) for x in c.tolist()]
        v1 = vol(closes, 252, per_year)
        if v1 is None or not (0.01 < v1 <= 3):     # above 300% a year the series is a halt or an unadjusted corporate action
            continue
        v3 = vol(closes, 756, per_year)
        got[t] = (round(v1, 3), round(v3, 3) if v3 else None, c.index[-1].date().isoformat())
    return got


def main() -> None:
    with open(ROOT / "data" / "stocks_universe.csv", newline="", encoding="utf-8") as f:
        universe = list(csv.DictReader(f))
    if len(sys.argv) > 1:                            # python tools/update_stock_vol.py 300  -> first 300 only (trial run)
        universe = universe[: int(sys.argv[1])]
    old = {r[0]: r for r in json.loads(OUT.read_text())["rows"]} if OUT.exists() else {}
    got: dict[str, tuple] = {}
    tickers = [u["ticker"] for u in universe]
    for i in range(0, len(tickers), BATCH):
        batch = tickers[i:i + BATCH]
        for attempt in (1, 2):
            try:
                got.update(fetch([t for t in batch if t not in got]))
            except Exception as err:                 # a failed batch must not stop the rest
                print(f"batch {i // BATCH}: {type(err).__name__}: {str(err)[:100]}")
            if sum(t in got for t in batch) >= 0.5 * len(batch):
                break
            time.sleep(20)
        print(f"{min(i + BATCH, len(tickers))}/{len(tickers)} requested, {len(got)} with data", flush=True)
        time.sleep(1)
    if len(got) < 0.6 * len(tickers):
        raise SystemExit(f"only {len(got)} of {len(tickers)} stocks came back; data/stocks.json left unchanged")
    newest = max(v[2] for v in got.values())
    stale = (dt.date.fromisoformat(newest) - dt.timedelta(days=10)).isoformat()
    got = {t: v for t, v in got.items() if v[2] >= stale}          # not traded for ten days: suspended, left out
    rows, kept = [], 0
    for u in universe:
        t = u["ticker"]
        if t in got:
            rows.append([t, u["ko"], u["en"], u["market"], *got[t]])
        elif t in old:
            rows.append(old[t]); kept += 1
    doc = {"generated": dt.date.today().isoformat(), "source": "Yahoo Finance via yfinance",
           "columns": ["ticker", "ko", "en", "market", "vol_1y", "vol_3y", "last"], "rows": rows}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"data/stocks.json: {len(rows)} stocks ({len(got)} fresh, {kept} kept from the previous file, "
          f"{len(universe) - len(rows)} left out), {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
