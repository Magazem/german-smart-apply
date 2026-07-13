import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match every path except Next.js internals, API-like assets, and files with an extension
  // (favicon.ico, etc.) - everything else is a locale-prefixed page.
  matcher: ['/((?!_next|.*\\..*).*)'],
};
