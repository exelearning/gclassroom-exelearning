import { APP_BASE_URL } from './config';

export type Route =
  | '/'
  | '/addon/discovery'
  | '/addon/teacher'
  | '/addon/student'
  | '/addon/review'
  | '/view'
  | '/picker'
  | '/publish';

const KNOWN_ROUTES: Route[] = [
  '/',
  '/addon/discovery',
  '/addon/teacher',
  '/addon/student',
  '/addon/review',
  '/view',
  '/picker',
  '/publish',
];

export function currentRoute(pathname: string = window.location.pathname): Route {
  const base = APP_BASE_URL.replace(/\/$/, '');
  let route = pathname;
  if (base && pathname.startsWith(base)) {
    route = pathname.slice(base.length) || '/';
  }
  if (route.length > 1 && route.endsWith('/')) {
    route = route.slice(0, -1);
  }
  if (route === '' || route === '/') {
    return '/';
  }
  return (KNOWN_ROUTES as string[]).includes(route) ? (route as Route) : '/';
}

export function buildRouteUrl(route: Route, params: Record<string, string> = {}): string {
  const url = new URL(window.location.origin);
  const base = APP_BASE_URL.replace(/\/$/, '');
  url.pathname = `${base}${route === '/' ? '/' : route}`;
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
