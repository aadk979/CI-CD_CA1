import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser, isOrganiser } from '@/lib/account';
import { getAuth } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';

/**
 * Next.js Proxy (formerly Middleware) guarding the organiser area (SCRUM-24).
 *
 * It answers before any rendering starts, so visitors get a real redirect and fans a real
 * 403 status, which a page can't set once its prerendered shell has started streaming.
 * It is not the only check: pages and Server Actions call `requireOrganiser()` themselves.
 */
export async function proxy(request: NextRequest) {
  const user = await getSessionUser(getAuth(), request.headers);
  const isPage = request.method === 'GET' || request.method === 'HEAD';

  if (!user) {
    // Server Action posts get a status, not a redirect that would re-post to /login.
    return isPage
      ? NextResponse.redirect(new URL('/login', request.url))
      : new NextResponse(null, { status: 401 });
  }
  if (!isOrganiser(user)) {
    // Answered here rather than rewritten to a page: Next drops the status of a rewrite.
    return isPage
      ? new NextResponse(FORBIDDEN_HTML, {
          status: 403,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        })
      : new NextResponse(null, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/organiser', '/organiser/:path*'],
};

const FORBIDDEN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Access denied · ${APP_NAME}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;
color:#c4c4d4;background:#07070c;line-height:1.5}
h1{color:#f5f5fa}
a{color:#a78bfa;font-weight:600}
</style></head>
<body data-testid="forbidden">
<h1>You don't have access</h1>
<p>This area is for event organisers. If you think you should have access, ask an
administrator to grant your account the organiser role.</p>
<p><a href="/">Back to upcoming events</a></p>
</body></html>`;
