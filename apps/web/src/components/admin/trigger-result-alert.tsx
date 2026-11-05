'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';

export interface ResultAlertProps {
  result: any;
  successMsg: string;
  enqueueMsg: string;
  fields?: { label: string; value: any }[];
}

export function TriggerResultAlert({
  result,
  successMsg,
  enqueueMsg,
  fields,
}: ResultAlertProps) {
  if (!result) return null;
  const isEnqueued = Boolean(result.jobId);
  return (
    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs space-y-1 font-mono text-emerald-300">
      <div className="font-sans font-semibold text-emerald-400 flex items-center gap-1.5 mb-1">
        <CheckCircle2 className="h-4 w-4" />
        {isEnqueued ? enqueueMsg : successMsg}
      </div>
      {isEnqueued ? (
        <div>Job ID: {result.jobId}</div>
      ) : (
        fields?.map((f) => (
          <div key={f.label}>
            {f.label}: {f.value}
          </div>
        ))
      )}
    </div>
  );
}
