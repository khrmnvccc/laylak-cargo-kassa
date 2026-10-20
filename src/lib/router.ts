import { useEffect, useState } from 'react';

export type Page = 'dashboard' | 'kassa' | 'operations' | 'daily' | 'periods' | 'workers' | 'attendance' | 'clients' | 'balance' | 'settings';
export const PAGES: Page[] = ['dashboard', 'kassa', 'operations', 'daily', 'periods', 'workers', 'attendance', 'clients', 'balance', 'settings'];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [path, search = ''] = hash.split('?');
  const page = (PAGES as string[]).includes(path) ? (path as Page) : 'dashboard';
  return { page, params: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(page: Page, params?: Record<string, string>) {
  const search = params ? new URLSearchParams(params).toString() : '';
  window.location.hash = `/${page}${search ? `?${search}` : ''}`;
}

export const href = (page: Page, params?: Record<string, string>) =>
  `#/${page}${params ? `?${new URLSearchParams(params).toString()}` : ''}`;
