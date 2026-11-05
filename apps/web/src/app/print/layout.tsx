import React from 'react';

export const metadata = {
  title: 'Print Document | Kumaran Chits',
  description: 'Bilingual A5 print preview and official document export for Kumaran Finance',
};

export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-start items-center p-0 sm:py-8 print:p-0 print:bg-white print:text-black">
      {children}
    </div>
  );
}
