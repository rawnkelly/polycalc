'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { evaluateQuotes, formatCents, formatCurrency, formatPercent, formatPercentFromFraction, formatSignedCents, type FeeMode, type SizingMode } from '@/lib/calculator';

type FormState = {
  fairYesProbability: string;
  bankroll: string;
  feeMode: FeeMode;
  customFeeCents: string;
  sizingMode: SizingMode;
  fixedDollarSize: string;
  fixedMaxLoss: string;
  fixedBankrollRiskPercent: string;
  kellyCapPercent: string;
  yesBid: string;
  yesAsk: string;
  noBid: string;
  noAsk: string;
};

const DEFAULTS: FormState = {
  fairYesProbability: '50',
  bankroll: '1000',
  feeMode: 'kalshi',
  customFeeCents: '1',
  sizingMode: 'quarter-kelly',
  fixedDollarSize: '100',
  fixedMaxLoss: '100',
  fixedBankrollRiskPercent: '2',
  kellyCapPercent: '25',
  yesBid: '',
  yesAsk: '',
  noBid: '',
  noAsk: '',
};

function num(value: string): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function MetricRow({ label, value }: { label: string; value: string }) { return <div className="metric-row"><span>{label}</span><strong>{value}</strong></div>; }

export default function CalculatorPage() {
  const nav = [{ href: '/', label: 'Overview' }, { href: '/calculator', label: 'Calculator' }, { href: '/watchlist', label: 'Watchlist' }, { href: '/monitor', label: 'Monitor' }, { href: 'https://github.com/Lurk-AI-INC/polycore', label: 'GitHub' }];
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...DEFAULTS };
    for (const key of Object.keys(next) as Array<keyof FormState>) {
      const value = params.get(key);
      if (value !== null) next[key] = value as never;
    }
    setForm(next);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(form as unknown as Record<string, string>);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [form]);

  const results = useMemo(() => evaluateQuotes({
    fairYesProbability: num(form.fairYesProbability),
    bankroll: num(form.bankroll),
    feeMode: form.feeMode,
    customFeeCents: num(form.customFeeCents),
    sizingMode: form.sizingMode,
    fixedDollarSize: num(form.fixedDollarSize),
    fixedMaxLoss: num(form.fixedMaxLoss),
    fixedBankrollRiskPercent: num(form.fixedBankrollRiskPercent),
    kellyCapPercent: num(form.kellyCapPercent),
    yesBid: form.yesBid === '' ? null : num(form.yesBid),
    yesAsk: form.yesAsk === '' ? null : num(form.yesAsk),
    noBid: form.noBid === '' ? null : num(form.noBid),
    noAsk: form.noAsk === '' ? null : num(form.noAsk),
  }), [form]);

  async function copyShareLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <main className="page-shell">
      <div className="page-frame">
        <div className="topbar panel-surface">
          <div className="brand-lockup"><div className="brand-mark">PC</div><div><p className="eyebrow">Open-source, local-first market toolkit by Lurk</p><div className="brand-line"><strong>PolyCore / Calculator</strong><span>Analyze a live binary contract</span></div></div></div>
          <div className="topbar-actions">{nav.map((link) => <Link key={link.href} className="secondary-button" href={link.href}>{link.label}</Link>)}</div>
        </div>

        <header className="hero panel-surface">
          <div className="hero-copy-wrap">
            <p className="eyebrow">Calculator module</p>
            <h1>Price the trade before you touch it.</h1>
            <p className="hero-copy">Quote-aware YES / NO pricing with target entry, reverse levels, slippage, fee presets, and sizing discipline.</p>
            <div className="hero-actions"><button className="primary-button" type="button" onClick={copyShareLink}>{copied ? 'Copied link' : 'Copy share link'}</button></div>
          </div>
          <div className="hero-rail">
            <div className="info-chip"><span>Recommendation</span><strong>{results.recommendation === 'buy-yes' ? 'Buy YES' : results.recommendation === 'buy-no' ? 'Buy NO' : 'Pass'}</strong></div>
            <div className="info-chip"><span>YES ask</span><strong>{formatCents(results.yes.price)}</strong></div>
            <div className="info-chip"><span>NO ask</span><strong>{formatCents(results.no.price)}</strong></div>
            <div className="info-chip"><span>Fee mode</span><strong>{form.feeMode}</strong></div>
          </div>
        </header>

        <section className="controls-layout">
          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">Inputs</p><h2>Quote assumptions</h2><p className="section-copy">Use direct quote fields so watchlist and monitor can hand markets straight in.</p></div></div>
            <div className="control-grid control-grid-3">
              <label className="field"><span>Fair YES (%)</span><input value={form.fairYesProbability} onChange={(e) => setForm({ ...form, fairYesProbability: e.target.value })} /></label>
              <label className="field"><span>Bankroll ($)</span><input value={form.bankroll} onChange={(e) => setForm({ ...form, bankroll: e.target.value })} /></label>
              <label className="field"><span>Kelly cap (%)</span><input value={form.kellyCapPercent} onChange={(e) => setForm({ ...form, kellyCapPercent: e.target.value })} /></label>
              <label className="field"><span>YES bid (¢)</span><input value={form.yesBid} onChange={(e) => setForm({ ...form, yesBid: e.target.value })} /></label>
              <label className="field"><span>YES ask (¢)</span><input value={form.yesAsk} onChange={(e) => setForm({ ...form, yesAsk: e.target.value })} /></label>
              <label className="field"><span>NO bid (¢)</span><input value={form.noBid} onChange={(e) => setForm({ ...form, noBid: e.target.value })} /></label>
              <label className="field"><span>NO ask (¢)</span><input value={form.noAsk} onChange={(e) => setForm({ ...form, noAsk: e.target.value })} /></label>
              <label className="field"><span>Custom fee (¢)</span><input value={form.customFeeCents} onChange={(e) => setForm({ ...form, customFeeCents: e.target.value })} /></label>
              <label className="field"><span>Fixed dollars</span><input value={form.fixedDollarSize} onChange={(e) => setForm({ ...form, fixedDollarSize: e.target.value })} /></label>
            </div>
          </section>

          <section className="section-frame panel-surface">
            <div className="section-head"><div><p className="eyebrow">Reverse</p><h2>Highest price you can pay</h2></div></div>
            <div className="table-wrap">
              <table className="data-table"><thead><tr><th>Constraint</th><th>YES max</th><th>NO max</th></tr></thead>
                <tbody>
                  <tr><td>Target EV</td><td>{formatCents(results.reverse.yesMaxForEv)}</td><td>{formatCents(results.reverse.noMaxForEv)}</td></tr>
                  <tr><td>Target ROI 10%</td><td>{formatCents(results.reverse.yesMaxForRoi)}</td><td>{formatCents(results.reverse.noMaxForRoi)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="results-grid">
          {[results.yes, results.no].map((side) => (
            <section key={side.label} className="result-card panel-surface">
              <div className="result-card-header"><div><p className="eyebrow">Outcome</p><h2>{side.label}</h2></div><span className={`badge ${side.netEv > 0 ? 'badge-positive' : 'badge-negative'}`}>{side.price === null ? 'Awaiting quote' : side.netEv > 0 ? 'Positive EV' : 'Pass'}</span></div>
              {side.price === null ? <div className="empty-state">Enter a quote to run this side.</div> : (
                <div className="stack-xl">
                  <div className="subpanel surface-soft">
                    <div className="subpanel-header"><h3>Core</h3></div>
                    <div className="metrics-grid">
                      <MetricRow label="Ask price" value={formatCents(side.price)} />
                      <MetricRow label="Fee / contract" value={formatCents(side.feePerContract)} />
                      <MetricRow label="Break-even probability" value={formatPercentFromFraction(side.breakEvenProbability)} />
                      <MetricRow label="Min fair needed" value={formatPercentFromFraction(side.breakEvenFair)} />
                      <MetricRow label="Your fair probability" value={formatPercentFromFraction(side.fairProbability)} />
                      <MetricRow label="Gross EV / contract" value={formatSignedCents(side.grossEv)} />
                      <MetricRow label="Net EV / contract" value={formatSignedCents(side.netEv)} />
                      <MetricRow label="ROI on risk" value={formatPercent(side.roiOnRisk * 100)} />
                    </div>
                  </div>
                  <div className="subpanel surface-soft">
                    <div className="subpanel-header"><h3>Sizing</h3></div>
                    <div className="metrics-grid">
                      <MetricRow label="Suggested dollars" value={`$${side.suggestedDollars.toFixed(2)}`} />
                      <MetricRow label="Suggested contracts" value={String(side.suggestedContracts)} />
                      <MetricRow label="Raw contracts" value={side.suggestedContractsRaw.toFixed(2)} />
                      <MetricRow label="Max loss" value={formatCurrency(side.maxLossDollars)} />
                      <MetricRow label="Max win" value={formatCurrency(side.maxWinDollars)} />
                    </div>
                  </div>
                </div>
              )}
            </section>
          ))}
        </section>

        <footer className="footer panel-surface"><div className="footer-main"><div><p className="eyebrow">PolyCore</p><h2>Calculator module inside PolyCore, the open utility layer by Lurk.</h2><p className="section-copy footer-copy">Live contract math, shareable state, and venue-aware fee presets.</p></div></div></footer>
      </div>
    </main>
  );
}
