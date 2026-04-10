import { NextRequest, NextResponse } from 'next/server';
import { normalizeMarket } from '@/lib/markets';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tickers = request.nextUrl.searchParams.get('tickers')?.trim() ?? '';
  if (!tickers) return NextResponse.json({ markets: [] });

  try {
    const response = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?tickers=${encodeURIComponent(tickers)}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return NextResponse.json({ error: `Kalshi request failed with ${response.status}` }, { status: 502 });
    const payload = await response.json() as { markets?: any[] };
    return NextResponse.json({ markets: Array.isArray(payload.markets) ? payload.markets.map(normalizeMarket) : [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
