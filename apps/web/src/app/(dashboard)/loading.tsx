import * as React from 'react';

/**
 * Next.js App Router Instant Route Loading Skeleton
 * Provides immediate visual feedback during route transitions across all dashboard views,
 * preventing blank screens and reassuring users during cellular latency spikes.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse p-1" aria-busy="true" aria-label="Loading dashboard content">
      {/* Top Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-56 bg-slate-800 rounded-lg" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-28 bg-slate-800 rounded-lg" />
          <div className="h-9 w-32 bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* KPI Summary Cards Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-3 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-slate-800 rounded" />
              <div className="h-8 w-8 bg-slate-800 rounded-lg" />
            </div>
            <div className="h-7 w-36 bg-slate-800 rounded" />
            <div className="h-3 w-20 bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Content Area Skeleton (Chart + Widget / Data Table) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-40 bg-slate-800 rounded" />
            <div className="h-4 w-24 bg-slate-800/60 rounded" />
          </div>
          <div className="h-56 w-full bg-slate-800/20 rounded-xl" />
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
          <div className="h-5 w-32 bg-slate-800 rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-800/30 p-3 space-y-2">
                <div className="h-3.5 w-3/4 bg-slate-800/60 rounded" />
                <div className="h-2.5 w-1/2 bg-slate-800/40 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
