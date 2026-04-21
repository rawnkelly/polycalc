import { SAMPLE_MARKETS } from '@/lib/markets';

export type SavedWatchlist = {
  id: string;
  name: string;
  tickers: string[];
  fairYesDefault: string;
  bankrollDefault: string;
  refreshSeconds: number;
};

export const WATCHLIST_STORAGE_KEY = 'polycore.watchlists.v3';
export const WATCHLIST_ACTIVE_ID_KEY = 'polycore.watchlists.active-id.v3';

export function parseTickersText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function stringifyTickers(tickers: string[]): string {
  return tickers.join(', ');
}

export function createDefaultWatchlists(): SavedWatchlist[] {
  return [
    {
      id: 'macro-sample',
      name: 'Macro sample',
      tickers: SAMPLE_MARKETS.map((market) => market.ticker),
      fairYesDefault: '50',
      bankrollDefault: '1000',
      refreshSeconds: 15,
    },
  ];
}

export function normalizeWatchlist(raw: unknown): SavedWatchlist {
  const value = raw as Partial<SavedWatchlist> | string[] | { tickers?: string[] };
  const tickers = Array.isArray(value)
    ? parseTickersText(value.join(','))
    : parseTickersText(Array.isArray(value?.tickers) ? value.tickers.join(',') : '');

  return {
    id:
      typeof (value as Partial<SavedWatchlist>)?.id === 'string' && (value as Partial<SavedWatchlist>).id?.trim()
        ? (value as Partial<SavedWatchlist>).id!.trim()
        : `watchlist-${Date.now()}`,
    name:
      typeof (value as Partial<SavedWatchlist>)?.name === 'string' && (value as Partial<SavedWatchlist>).name?.trim()
        ? (value as Partial<SavedWatchlist>).name!.trim()
        : 'Imported watchlist',
    tickers,
    fairYesDefault: String((value as Partial<SavedWatchlist>)?.fairYesDefault ?? '50'),
    bankrollDefault: String((value as Partial<SavedWatchlist>)?.bankrollDefault ?? '1000'),
    refreshSeconds: Math.max(5, Number((value as Partial<SavedWatchlist>)?.refreshSeconds ?? 15) || 15),
  };
}

export function parseWatchlistImport(text: string): SavedWatchlist {
  const parsed = JSON.parse(text) as unknown;
  return normalizeWatchlist(parsed);
}

export function serializeWatchlist(value: SavedWatchlist): string {
  return JSON.stringify(value, null, 2);
}
