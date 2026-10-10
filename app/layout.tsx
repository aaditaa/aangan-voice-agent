import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Aangan Studio · call desk',
  description: 'Every enquiry answered, qualified and booked — and never a price.',
};

/* Tokens first, then components. Chart series colours are the validated pair
   (orange #eb6834 / blue #2a78d6, re-stepped for the dark surface); everything
   else is UI chrome. */
const CSS = `
:root {
  --bg:#f3f4fa; --card:#ffffff; --card-2:#fafbff;
  --ink:#161a2b; --ink-2:#39405c; --muted:#767d99; --faint:#a6abc2;
  --line:#e7e9f3; --line-2:#eef0f8;
  --accent:#f26a21; --accent-soft:#fdeee4;
  --violet:#6d5bd0; --violet-soft:#ece9fb;
  --good:#12a06a; --good-soft:#e2f5ed;
  --warn:#c98500; --warn-soft:#fdf2dc;
  --bad:#d8453f; --bad-soft:#fce9e8;
  --s1:#eb6834; --s2:#2a78d6;
  --grid:#edeff7; --band:#eef1fa;
  --shadow:0 1px 2px rgba(20,25,50,.04), 0 8px 24px -12px rgba(20,25,50,.12);
  --r:16px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#0f1118; --card:#171a24; --card-2:#1c1f2b;
    --ink:#f0f2f8; --ink-2:#c7cbda; --muted:#8f95ad; --faint:#6b7189;
    --line:#262a38; --line-2:#20242f;
    --accent:#ff8a4c; --accent-soft:#33210f;
    --violet:#9b8cf0; --violet-soft:#241f3d;
    --good:#3fc08c; --good-soft:#12291f;
    --warn:#e0b254; --warn-soft:#2b2211;
    --bad:#f0776f; --bad-soft:#2e1715;
    --s1:#d95926; --s2:#3987e5;
    --grid:#242838; --band:#1f2431;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 10px 28px -14px rgba(0,0,0,.6);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg:#0f1118; --card:#171a24; --card-2:#1c1f2b;
  --ink:#f0f2f8; --ink-2:#c7cbda; --muted:#8f95ad; --faint:#6b7189;
  --line:#262a38; --line-2:#20242f;
  --accent:#ff8a4c; --accent-soft:#33210f;
  --violet:#9b8cf0; --violet-soft:#241f3d;
  --good:#3fc08c; --good-soft:#12291f;
  --warn:#e0b254; --warn-soft:#2b2211;
  --bad:#f0776f; --bad-soft:#2e1715;
  --s1:#d95926; --s2:#3987e5;
  --grid:#242838; --band:#1f2431;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 10px 28px -14px rgba(0,0,0,.6);
  color-scheme: dark;
}

* { box-sizing:border-box; }
html, body { margin:0; padding:0; }
body {
  background:var(--bg); color:var(--ink);
  font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
a { color:inherit; text-decoration:none; }
.num { font-variant-numeric:tabular-nums; }

/* ---------- shell ---------- */
.shell { display:grid; grid-template-columns:232px minmax(0,1fr) 300px; gap:18px; max-width:1560px; margin:0 auto; padding:18px; align-items:start; }
@media (max-width:1240px){ .shell{ grid-template-columns:212px minmax(0,1fr); } .rail-r{ display:none; } }
@media (max-width:880px){ .shell{ grid-template-columns:minmax(0,1fr); padding:14px; } .rail-l{ display:none; } }

.card { background:var(--card); border:1px solid var(--line); border-radius:var(--r); box-shadow:var(--shadow); }
.pad { padding:18px 20px; }

/* ---------- left rail ---------- */
.rail-l { position:sticky; top:18px; display:flex; flex-direction:column; gap:14px; }
.brand { display:flex; gap:11px; align-items:center; padding:16px 18px; }
.mark { width:38px; height:38px; border-radius:11px; background:linear-gradient(140deg,var(--accent),var(--violet)); display:grid; place-items:center; color:#fff; font-weight:700; font-size:15px; flex:none; }
.brand b { display:block; font-size:14.5px; line-height:1.25; }
.brand span { display:block; font-size:11.5px; color:var(--muted); }
.navlabel { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint); padding:0 20px; margin:2px 0 6px; }
.nav { display:flex; flex-direction:column; gap:2px; padding:0 10px 14px; }
.nav a { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:10px; font-size:13.5px; color:var(--ink-2); }
.nav a:hover { background:var(--card-2); }
.nav a[data-on="1"] { background:var(--accent-soft); color:var(--accent); font-weight:600; }
.nav .dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:.65; flex:none; }
.nav .count { margin-left:auto; font-size:11.5px; color:var(--faint); }
.nav a[data-on="1"] .count { color:var(--accent); }

.cutcard { background:linear-gradient(150deg,var(--violet),var(--accent)); color:#fff; border-radius:var(--r); padding:16px 18px; }
.cutcard p { margin:0; }
.cutcard .k { font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; opacity:.85; }
.cutcard .v { font-size:26px; font-weight:700; line-height:1.15; margin:4px 0 2px; }
.cutcard .s { font-size:12px; opacity:.92; line-height:1.45; }

/* ---------- header ---------- */
.head { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-bottom:16px; }
.head h1 { font-size:26px; letter-spacing:-.02em; margin:0 0 3px; }
.head p { margin:0; color:var(--muted); font-size:13.5px; }
.search { margin-left:auto; display:flex; gap:8px; align-items:center; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:8px 12px; box-shadow:var(--shadow); min-width:240px; }
.search input { border:0; background:transparent; color:var(--ink); font:inherit; font-size:13.5px; outline:none; width:100%; }
.search input::placeholder { color:var(--faint); }
.search button { border:0; background:var(--accent); color:#fff; font:inherit; font-size:12.5px; font-weight:600; border-radius:8px; padding:5px 11px; cursor:pointer; }

/* ---------- stat tiles ---------- */
.tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(176px,1fr)); gap:14px; margin-bottom:16px; }
.tile { padding:16px 18px; }
.tile .top { display:flex; align-items:center; gap:11px; margin-bottom:12px; }
.ico { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; flex:none; }
.tile .top > span:last-child { min-width:0; }
.tile .lab { display:block; font-size:12.5px; color:var(--muted); line-height:1.3; }
.tile .val { display:block; font-size:25px; font-weight:700; letter-spacing:-.02em; line-height:1.15; margin-top:1px; }
.bar { height:5px; border-radius:99px; background:var(--line-2); overflow:hidden; margin:2px 0 8px; }
.bar i { display:block; height:100%; border-radius:99px; }
.tile .foot { font-size:11.5px; color:var(--muted); }

/* ---------- chart cards ---------- */
.grid2 { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(0,1fr); gap:16px; margin-bottom:16px; }
@media (max-width:980px){ .grid2{ grid-template-columns:minmax(0,1fr); } }
.ctitle { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:2px; }
.ctitle h2 { font-size:15.5px; margin:0; }
.ctitle span { font-size:12.5px; color:var(--muted); }
.legend { display:flex; gap:14px; flex-wrap:wrap; margin:10px 0 0; }
.legend i { display:inline-flex; align-items:center; gap:6px; font-style:normal; font-size:12px; color:var(--muted); }
.legend b { width:9px; height:9px; border-radius:3px; display:inline-block; }
figure { margin:0; }
figcaption { font-size:12px; color:var(--muted); margin-top:9px; line-height:1.5; }

/* ---------- call list ---------- */
.rows { display:flex; flex-direction:column; gap:7px; }
.row { display:flex; align-items:center; gap:11px; padding:10px 12px; border-radius:12px; background:var(--card-2); }
.av { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; font-size:13px; font-weight:700; color:#fff; flex:none; }
.row .who { min-width:0; flex:1; }
.row .who b { display:block; font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.row .who span { display:block; font-size:11.5px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.chip { font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; padding:3px 8px; border-radius:99px; white-space:nowrap; flex:none; }
.row .when { font-size:11.5px; color:var(--faint); white-space:nowrap; flex:none; }
@media (max-width:520px){ .row .when{ display:none; } }

/* ---------- right rail ---------- */
.rail-r { position:sticky; top:18px; display:flex; flex-direction:column; gap:14px; }
.mini { display:grid; grid-template-columns:repeat(3,1fr); gap:4px; text-align:center; }
.mini b { display:block; font-size:19px; font-weight:700; letter-spacing:-.02em; }
.mini span { display:block; font-size:10.5px; color:var(--muted); margin-top:1px; }
.linkrow { display:flex; align-items:center; gap:11px; padding:11px 14px; border-radius:12px; background:var(--card-2); font-size:13.5px; }
.linkrow:hover { background:var(--accent-soft); }
.linkrow .arrow { margin-left:auto; color:var(--faint); }

.empty { padding:26px 20px; text-align:center; color:var(--muted); font-size:13.5px; }
footer.note { color:var(--muted); font-size:12px; line-height:1.6; padding:4px 2px 10px; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <style>{CSS}</style>
        {children}
      </body>
    </html>
  );
}
