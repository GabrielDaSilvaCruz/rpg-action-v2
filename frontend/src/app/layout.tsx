import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RPG Ação — Tabuleiro Virtual 3D',
  description:
    'Tabuleiro virtual de RPG 3D online estilo TaleSpire com editor de mapas para o Mestre, importador de miniaturas STL, OBJ e glTF/GLB e movimentação em tempo real.',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="w-full h-full m-0 p-0 overflow-hidden bg-[#0d1015] text-stone-100 antialiased select-none">
        {children}
      </body>
    </html>
  );
}
