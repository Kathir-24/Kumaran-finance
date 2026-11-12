'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  Briefcase,
  UserCheck,
  Building,
  FileCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function SopGuideCard() {
  const t = useTranslations('instructions');

  const sops = [
    {
      role: 'Desk Accountant & Cashier',
      icon: Briefcase,
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      badge: 'Counter & Vault',
      duties: [
        'Morning Safe Opening: Physically count office safe cash; verify Opening Balance matches Form XXII Cash Book.',
        'Counter Collection: Collect exact discrete net installment due in full. Instant digital bilingual receipt issuance.',
        'Zero Partial Payments: Strictly enforce single discrete payment. Zero partial dues and zero advance balances permitted.',
        'Evening Cash Handover: Receive field agent collections; count currency notes and verify against mobile batch submission.',
        'Maker Reversals: Initiate payment reversal requests with mandatory reason code & proof attachment. Cannot self-approve (Maker != Checker).',
      ],
    },
    {
      role: 'Field Collection Agent',
      icon: UserCheck,
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      badge: 'Doorstep Operations',
      duties: [
        'Route Synchronization: Sync assigned customer list for the day via Android Mobile App.',
        'Doorstep Collection: Collect exact net installment due. Reconcile passbook amount with app.',
        'Physical Pen Signing: Sign the physical paper passbook booklet with date and collected amount.',
        'Digital Receipt: Instant SMS or mobile push notification receipt triggered directly to customer.',
        'Evening Branch Surrender: Surrender 100% collected physical cash to Partner at Head Office (Perundurai).',
        'Zero Overnight Holding: Strictly prohibited from holding company collection cash overnight.',
      ],
    },
    {
      role: 'Partner, Foreman & Branch Manager',
      icon: Building,
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      badge: 'Executive & Dual-Control',
      duties: [
        'In-Branch Auction: Conduct monthly in-office auctions (Months 2 to N-1) with 1/4 ceiling & Option A paper token tie-break draw.',
        'Dual-Control Handover Sign-off: Physically count cash from field agents; official deposit sign-off (Collector != Acknowledger).',
        'Checker Reversals: Review and authorize payment reversal requests initiated by Desk Accountant (Maker != Checker).',
        'Prize Disbursement Authorization: Verify safety proof checklist (agreement, blank cheques, promissory notes) before authorizing payout.',
        'Statutory Filing: Ensure Form XVII auction proceedings minutes are filed with Registrar within strictly 21 calendar days.',
      ],
    },
    {
      role: 'Independent CA Auditor',
      icon: FileCheck,
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
      badge: 'Audit & Compliance',
      duties: [
        'Read-Only Portal Access: Independent verification of cash books, day books, defaulter registers, and auction registers.',
        'Whole-Rupee Mathematical Verification: Confirm 100% adherence to BigInt integer rupee math with zero paise discrepancies.',
        'Statutory Minutes Verification: Check 21-day challan acknowledgements filed with Deputy Registrar of Chits.',
        'Immutable Audit Trail: Review system audit logs for critical operations, timestamps, and dual-control signatures.',
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sops.map((sop, idx) => {
        const Icon = sop.icon;
        return (
          <Card key={idx} className="border-slate-800 bg-slate-900/60 shadow-sm flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${sop.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold text-white">
                      {sop.role}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400">
                      {t('checklistSubtitle')}
                    </CardDescription>
                  </div>
                </div>

                <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300 shrink-0">
                  {sop.badge}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-2 text-xs text-slate-300">
              <ul className="space-y-2">
                {sop.duties.map((duty, dIdx) => (
                  <li key={dIdx} className="flex items-start gap-2 leading-relaxed">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
                    <span>{duty}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
