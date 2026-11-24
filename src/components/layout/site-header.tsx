import { Suspense } from 'react';
import { UserMenu } from '@/components/auth/user-menu';
import { container } from '@/components/ui/styles';
import { Logo } from './logo';
import { NavPills, NavPillsFallback } from './nav-pills';
import { SiteMenu } from './site-menu';

/** 64px top bar: logo, centred pill-group nav, account actions; hamburger on mobile. */
export function SiteHeader() {
  return (
    <header className="border-hairline bg-canvas/80 sticky top-0 z-50 border-b backdrop-blur-xl">
      <div className={`${container} h-nav relative flex items-center gap-6`}>
        <Logo />
        <SiteMenu>
          <div className="lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            {/* The active pill depends on the URL, which dynamic routes only know at request time. */}
            <Suspense fallback={<NavPillsFallback />}>
              <NavPills />
            </Suspense>
          </div>
          <div className="md:ml-auto">
            {/* The session is request data: stream it in so the rest of the page stays static. */}
            <Suspense fallback={<span className="block h-8 w-40" aria-hidden />}>
              <UserMenu />
            </Suspense>
          </div>
        </SiteMenu>
      </div>
    </header>
  );
}
