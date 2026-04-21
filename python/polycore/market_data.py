from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .formatting import format_close_time, format_time_to_close, utc_now_iso
from .models import Market, Snapshot


API_BASE = 'https://api.elections.kalshi.com/trade-api/v2'
REQUEST_TIMEOUT_SECONDS = 8


def _make_sample(ticker: str, title: str, status: str, yb: int, ya: int, nb: int, na: int, last: int, hours: int, volume24h: int) -> Market:
    from datetime import datetime, timedelta, timezone

    close_time = (datetime.now(tz=timezone.utc) + timedelta(hours=hours)).replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    midpoint = (yb + ya) / 2
    return Market(
        ticker=ticker,
        title=title,
        status=status,
        yes_bid_cents=yb,
        yes_ask_cents=ya,
        no_bid_cents=nb,
        no_ask_cents=na,
        last_price_cents=last,
        midpoint_cents=midpoint,
        yes_spread_cents=ya - yb,
        close_time=close_time,
        close_time_label=format_close_time(close_time),
        time_to_close_label=format_time_to_close(close_time),
        volume24h=float(volume24h),
        updated_at=utc_now_iso(),
    )


SAMPLE_MARKETS: list[Market] = [
    _make_sample('DEMO-GDP-2026', 'Will US GDP beat consensus this quarter?', 'open', 47, 49, 51, 53, 48, 36, 18200),
    _make_sample('DEMO-CPI-2026', 'Will CPI print above 0.3% this month?', 'open', 58, 61, 39, 42, 60, 8, 9200),
    _make_sample('DEMO-RATE-2026', 'Will the Fed cut at the next meeting?', 'paused', 24, 27, 73, 76, 25, 288, 5400),
]


def cents(value: Any) -> int | None:
    if value in (None, ''):
        return None
    try:
        return round(float(value) * 100)
    except (TypeError, ValueError):
        return None


def normalize_market(raw: dict[str, Any], *, captured_at: str) -> Market:
    yes_bid = cents(raw.get('yes_bid_dollars'))
    yes_ask = cents(raw.get('yes_ask_dollars'))
    no_bid = cents(raw.get('no_bid_dollars'))
    no_ask = cents(raw.get('no_ask_dollars'))
    last = cents(raw.get('last_price_dollars'))
    midpoint = None
    if yes_bid is not None and yes_ask is not None:
        midpoint = (yes_bid + yes_ask) / 2
    spread = yes_ask - yes_bid if yes_ask is not None and yes_bid is not None else None
    close_time = raw.get('close_time')
    volume = raw.get('volume_24h_fp')
    try:
        volume_value = float(volume) if volume is not None else None
    except (TypeError, ValueError):
        volume_value = None

    return Market(
        ticker=str(raw.get('ticker') or ''),
        title=str(raw.get('title') or ''),
        status=str(raw.get('status') or 'unknown'),
        yes_bid_cents=yes_bid,
        yes_ask_cents=yes_ask,
        no_bid_cents=no_bid,
        no_ask_cents=no_ask,
        last_price_cents=last,
        midpoint_cents=midpoint,
        yes_spread_cents=spread,
        close_time=close_time,
        close_time_label=format_close_time(close_time),
        time_to_close_label=format_time_to_close(close_time),
        volume24h=volume_value,
        updated_at=captured_at,
    )


def fetch_markets(tickers: list[str], *, demo: bool = False) -> Snapshot:
    captured_at = utc_now_iso()
    cleaned = [ticker.strip().upper() for ticker in tickers if ticker.strip()]
    if demo or not cleaned:
        demo_rows = [market for market in SAMPLE_MARKETS if not cleaned or market.ticker in cleaned]
        return Snapshot(captured_at=captured_at, source='demo', tickers=cleaned, markets=demo_rows, warning='')

    url = f"{API_BASE}/markets?tickers={urllib.parse.quote(','.join(cleaned))}"
    request = urllib.request.Request(url, headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode('utf-8'))
        rows = payload.get('markets') if isinstance(payload, dict) else []
        markets = [normalize_market(raw, captured_at=captured_at) for raw in rows if isinstance(raw, dict)]
        return Snapshot(captured_at=captured_at, source='live', tickers=cleaned, markets=markets)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
        demo_rows = [market for market in SAMPLE_MARKETS if market.ticker in cleaned]
        return Snapshot(
            captured_at=captured_at,
            source='demo',
            tickers=cleaned,
            markets=demo_rows,
            warning=f'Live request failed. Falling back to demo rows: {error}',
            meta={'fallbackFrom': 'live'},
        )
