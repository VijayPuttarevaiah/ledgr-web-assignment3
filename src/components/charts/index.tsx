"use client";

/**
 * Assignment 3 §2 — client-side optimisation 1: one recharts chunk, not two.
 *
 * Dashboard and Analytics both code-split their charts, which is right, but
 * they split them into *different* modules: Dashboard lazily imported
 * `spending-trend-chart.tsx` and Analytics lazily imported
 * `cash-flow-chart.tsx` and `category-pie-chart.tsx`. Each of those files
 * imports recharts, and a bundler cannot share code between two async
 * chunks that are reached from different entry points — so the build
 * emitted two chunks of 316 KB each, both containing a full copy of the
 * charting library.
 *
 * Measured on the built output before this change:
 *
 *   /dashboard   0it3hq1xubbmh.js   316 KB   (recharts)
 *   /analytics   1dsgm3tbi2hz6.js   316 KB   (recharts, again)
 *
 * A user who opens the Dashboard and then clicks Analytics — the single most
 * common path through this app — downloaded, parsed and compiled the same
 * library twice.
 *
 * Routing both dynamic imports through this one module gives the bundler a
 * single async chunk to emit. Dashboard now also carries the two Analytics
 * chart components, which is a real cost, but they are a few kilobytes of
 * JSX against 316 KB of shared library — the trade is heavily in favour.
 *
 * The individual component files are left untouched and still own their own
 * implementations; this module only decides how they are grouped for the
 * bundler.
 */
export { SpendingTrendChart } from "@/components/dashboard/spending-trend-chart";
export { CashFlowChart } from "@/components/analytics/cash-flow-chart";
export { CategoryPieChart } from "@/components/analytics/category-pie-chart";
