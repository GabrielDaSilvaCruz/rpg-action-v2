'use client';

import dynamic from 'next/dynamic';

// Carregamento dinâmico do SpireTable 3D (Three.js WebGL roda estritamente no cliente)
const SpireTableApp = dynamic(() => import('../App'), {
  ssr: false,
  loading: () => (
    <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#0d1015] text-amber-500 gap-3">
      <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      <span className="font-semibold text-sm tracking-wide text-stone-300">
        Carregando SpireTable 3D...
      </span>
    </div>
  ),
});

export default function HomePage() {
  return <SpireTableApp />;
}
