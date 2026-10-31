import * as React from 'react';
import { useTranslations } from 'next-intl';
import { formatRupee } from '@kumaran/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { BusinessRuleBanner, RuleTooltip } from '@/components/ui/business-rule-banner';
import { CheckCircle2, AlertTriangle, ShieldCheck, Landmark, Receipt, Users } from 'lucide-react';

export default function SmokeVerificationPage() {
  const t = useTranslations();

  // Test Guardrail 2: Whole Rupee Math via @kumaran/api-client
  const sampleChitValue = 100000n;
  const sampleCommission = 4000n;
  const sampleCeiling = 25000n;
  const sampleDividend = 21000n;
  const sampleNetDue = 3950n; // 5000 - 1050

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 space-y-8 max-w-6xl mx-auto">
      {/* Topbar Header */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Landmark className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-50">
                {t('app.title')}
              </h1>
              <p className="text-sm text-slate-400">{t('app.tagline')} • {t('app.branch')}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="paid">
            {t('common.status')}: {t('app.badge')}
          </Badge>
          <Badge variant="neutral">
            v{t('common.version')}
          </Badge>
        </div>
      </header>

      {/* Contextual Business Rule Banners Showcase */}
      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          In-Page Contextual Business Rule Banners (Task 1.2)
        </h2>

        <BusinessRuleBanner
          ruleNumber={3}
          title={t('rules.guardrail3Title')}
          description={t('rules.guardrail3Desc')}
          bulletPoints={[
            '4.00% permanently frozen upon group creation (ADR-04)',
            'Foreman commission is deducted before universal dividend allocation',
            'Zero user override or manual variance permitted'
          ]}
          referencePath="/instructions"
        />

        <BusinessRuleBanner
          ruleNumber={6}
          title={t('rules.guardrail6Title')}
          description={t('rules.guardrail6Desc')}
          bulletPoints={[
            'Ceiling Discount = Chit Value / 4 (25.00% max)',
            'Option A Tie-Break: Foreman draws paper tokens physically at branch in front of members',
            'Zero autonomous software lottery draws permitted'
          ]}
          referencePath="/instructions"
        />
      </section>

      {/* High-Density Workstation Atoms Showcase */}
      <section className="space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Foundational Radix UI Atoms & Design Tokens
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Button Atoms & Status Badges */}
          <Card>
            <CardHeader>
              <CardTitle>Button & Badge Atoms</CardTitle>
              <CardDescription>Financial action buttons with high-contrast accessibility</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="default">Primary Action</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="destructive">Destructive</Button>
                <Button variant="default" isLoading>Processing</Button>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-400 block mb-2">Financial Status Badges:</span>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="paid">{t('common.paid')}</Badge>
                  <Badge variant="unpaid">{t('common.unpaid')}</Badge>
                  <Badge variant="overdue">{t('common.overdue')}</Badge>
                  <Badge variant="pending">{t('common.pending')}</Badge>
                  <Badge variant="neutral">{t('common.active')}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Financial Input & Tooltips */}
          <Card>
            <CardHeader>
              <CardTitle>Financial Inputs & Tooltips</CardTitle>
              <CardDescription>Whole Rupee inputs with currency prefix & inline helpers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <span>{t('schemes.chitValue')}</span>
                  <RuleTooltip content="Total pooled value across all 20 months. Must be whole Rupees." />
                </label>
                <Input prefixSymbol="₹" defaultValue="100000" />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <span>{t('auctions.bidAmount')}</span>
                  <RuleTooltip content="Discount bid by subscriber. Must be >= 4% and <= 25%." />
                </label>
                <Input prefixSymbol="₹" defaultValue="25000" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card 3: Tabs & Modal Dialog Showcase */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs & Modal Dialog Atom</CardTitle>
            <CardDescription>Accessible tab navigation and modal popups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="scheme1">
              <TabsList>
                <TabsTrigger value="scheme1">KCA-1L-20M</TabsTrigger>
                <TabsTrigger value="scheme2">KCB-5L-20M</TabsTrigger>
                <TabsTrigger value="scheme3">KCC-10L-20M</TabsTrigger>
              </TabsList>
              <TabsContent value="scheme1" className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                Scheme KCA-1L-20M • Chit Value: {formatRupee(sampleChitValue)} • Commission: {formatRupee(sampleCommission)}
              </TabsContent>
              <TabsContent value="scheme2" className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                Scheme KCB-5L-20M • Chit Value: {formatRupee(500000n)} • Commission: {formatRupee(20000n)}
              </TabsContent>
              <TabsContent value="scheme3" className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-sm">
                Scheme KCC-10L-20M • Chit Value: {formatRupee(1000000n)} • Commission: {formatRupee(40000n)}
              </TabsContent>
            </Tabs>

            <div className="pt-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Receipt className="h-4 w-4" />
                    <span>Open Sample Counter Dialog</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('collections.title')}</DialogTitle>
                    <DialogDescription>{t('collections.exactDue')}</DialogDescription>
                  </DialogHeader>
                  <div className="py-4 text-sm text-slate-300 space-y-2">
                    <p>Sample Net Installment Payable: <strong className="text-emerald-400">{formatRupee(sampleNetDue)}</strong></p>
                    <p className="text-xs text-slate-400">{t('collections.discretePaymentOnly')}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="default">{t('common.confirm')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Financial Data Table Atom */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Data Table Atom</CardTitle>
            <CardDescription>High-density ledger presentation with Whole Rupee formatting</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket #</TableHead>
                  <TableHead>Subscriber Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Installment Due</TableHead>
                  <TableHead>Dividend</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-mono font-semibold">T-01</TableCell>
                  <TableCell>Company Ticket (Foreman)</TableCell>
                  <TableCell>9842143210</TableCell>
                  <TableCell className="font-mono text-emerald-300">{formatRupee(5000n)}</TableCell>
                  <TableCell className="font-mono text-slate-400">₹0</TableCell>
                  <TableCell><Badge variant="paid">{t('common.paid')}</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono font-semibold">T-02</TableCell>
                  <TableCell>P. Shanmugam</TableCell>
                  <TableCell>9842198765</TableCell>
                  <TableCell className="font-mono text-emerald-300">{formatRupee(3950n)}</TableCell>
                  <TableCell className="font-mono text-amber-300">{formatRupee(1050n)}</TableCell>
                  <TableCell><Badge variant="paid">{t('common.paid')}</Badge></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-mono font-semibold">T-03</TableCell>
                  <TableCell>K. Ramasamy</TableCell>
                  <TableCell>9842111223</TableCell>
                  <TableCell className="font-mono text-amber-300">{formatRupee(3950n)}</TableCell>
                  <TableCell className="font-mono text-amber-300">{formatRupee(1050n)}</TableCell>
                  <TableCell><Badge variant="unpaid">{t('common.unpaid')}</Badge></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Footer Summary */}
      <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-500">
        <div>
          <span>{t('app.company')} • {t('app.branch')}</span>
        </div>
        <div>
          <span>Task 1.2: Design Tokens, Typography & next-intl UI Atoms Complete</span>
        </div>
      </footer>
    </div>
  );
}
