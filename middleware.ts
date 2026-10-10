import { NextResponse, type NextRequest } from 'next/server';

/** The dashboard shows caller names and numbers, so it is never public.
 *  Username is "aangan"; the password is DASHBOARD_PASSWORD. */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next(); // not configured yet — local dev

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const [user, ...rest] = atob(header.slice(6)).split(':');
      if (user === 'aangan' && rest.join(':') === password) return NextResponse.next();
    } catch {
      /* fall through to the challenge */
    }
  }
  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Aangan dashboard", charset="UTF-8"' },
  });
}

/** Dashboard only. The webhook authenticates with its own token and must stay open to Vaani. */
export const config = { matcher: ['/'] };
