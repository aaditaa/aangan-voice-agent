import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aangan Studio · call agent',
  description: 'Every enquiry answered, qualified and booked — and never a price.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <style>{`
          :root {
            --bg:#f5f3f0; --card:#ffffff; --ink:#1c1917; --muted:#78716c;
            --line:#e7e5e4; --accent:#1c1917; --good:#15803d; --warn:#b45309; --bad:#b91c1c;
          }
          @media (prefers-color-scheme: dark) {
            :root:not([data-theme="light"]) {
              --bg:#1c1917; --card:#262321; --ink:#f5f3f0; --muted:#a8a29e;
              --line:#3f3b38; --accent:#f5f3f0; --good:#4ade80; --warn:#fbbf24; --bad:#f87171;
            }
          }
          * { box-sizing:border-box; }
          body {
            margin:0; background:var(--bg); color:var(--ink);
            font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
            -webkit-font-smoothing:antialiased;
          }
          a { color:inherit; }
        `}</style>
      </body>
    </html>
  );
}
