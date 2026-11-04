import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-4 text-center">
      <div className="space-y-4 max-w-md">
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-wide text-emerald-400 uppercase">
            404 — Page Not Found
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Page does not exist
          </h1>
          <p className="text-xs text-slate-400">
            The requested operations page or resource could not be found. Please return to the dashboard.
          </p>
        </div>
        <div>
          <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
            <Link href="/dashboard">Return to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
