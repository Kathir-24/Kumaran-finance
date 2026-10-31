'use client';

// ==============================================================================
// Kumaran Chits — Bilingual Locale Switcher (English / தமிழ்)
// Workstation header toggle setting NEXT_LOCALE cookie with instant hydration.
// ==============================================================================

import * as React from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LocaleSwitcher() {
  const currentLocale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const nextLocale = currentLocale === 'en' ? 'ta' : 'en';
  const label = currentLocale === 'en' ? 'தமிழ்' : 'English';

  const handleToggle = () => {
    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      className="flex items-center space-x-2 border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500/50 hover:bg-slate-800"
      aria-label="Switch Language / மொழியை மாற்றவும்"
      data-testid="locale-switcher"
    >
      <Languages className="h-4 w-4 text-emerald-400" />
      <span>{label}</span>
    </Button>
  );
}
