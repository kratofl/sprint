// Whether a sidebar entry is the current page. The root only matches itself;
// every other entry matches its own path and anything nested under it, on a
// segment boundary (so `/dash` does not light up for `/dashboard`).
export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
