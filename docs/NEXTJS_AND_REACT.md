# Next.js & React — Concepts for this Project

## What is React?

React is a JavaScript/TypeScript library for building user interfaces. The core idea: your UI is a function of your data.

```tsx
function LapDisplay({ time }: { time: number }) {
  return <span className="font-mono">{time.toFixed(3)}</span>
}
```

Whenever `time` changes, React re-renders this component automatically. You never manually touch the DOM.

### Components

Everything in React is a **component** — a function that receives props and returns JSX (HTML-like syntax in TypeScript):

```tsx
// A component that shows a badge
function Badge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={active ? 'bg-green-500 text-white' : 'bg-gray-200'}>
      {label}
    </span>
  )
}

// Using it
<Badge label="Live" active={connected} />
```

### State

State is data that belongs to a component and can change over time. When state changes, React re-renders:

```tsx
function Counter() {
  const [count, setCount] = useState(0)   // state: starts at 0

  return (
    <button onClick={() => setCount(count + 1)}>
      Clicked {count} times
    </button>
  )
}
```

### Hooks

Hooks are functions that let you use React features (state, side effects, context) inside function components. They all start with `use`:

| Hook | What it does |
|---|---|
| `useState` | Local mutable state |
| `useEffect` | Run code when something changes (e.g. subscribe to events on mount) |
| `useCallback` | Memoize a function so it doesn't get recreated every render |
| `useMemo` | Memoize a computed value |
| `useRef` | Hold a mutable value that doesn't trigger re-renders |

Example from this project (`useTelemetry.ts`):

```ts
export function useTelemetry() {
  const [frame, setFrame] = useState<TelemetryFrame | null>(null)

  useEffect(() => {
    // Subscribe to events from Go on mount
    const unsub = EventsOn('telemetry:frame', setFrame)
    return unsub  // unsubscribe when component unmounts
  }, [])

  return { frame }
}
```

---

## What is Next.js?

Next.js is a **framework built on top of React** that adds routing, server-side rendering, and a build system. While React is just a library (it only handles the view layer), Next.js is a full framework.

In this project, Next.js is used for the **web app** (`/web`) — the browser-based frontend for telemetry analysis, setup management, and the race engineer portal.

The **desktop app** (`/app/frontend`) uses plain React + Vite, **not** Next.js, because Wails handles the serving and there's no need for server-side rendering.

### App Router (the modern way)

Next.js 13+ uses the **App Router**, where the folder structure in `app/` defines your routes:

```
web/app/
├── layout.tsx           → wraps every page (nav, providers)
├── page.tsx             → renders at /
├── sessions/
│   └── page.tsx         → renders at /sessions
├── engineer/
│   └── page.tsx         → renders at /engineer
└── api/
    └── health/
        └── route.ts     → API route at /api/health
```

### Server Components vs Client Components

This is the most important concept in modern Next.js.

**Server Components** (default): Run on the server. Can fetch data directly, access databases, read files. Cannot use browser APIs, `useState`, `useEffect`, or event handlers.

**Client Components**: Run in the browser. Can use all React hooks, event listeners, and browser APIs. Must add `'use client'` at the top of the file.

```tsx
// Server Component — no 'use client', runs on server
// Can call the database or API directly
export default async function SessionsPage() {
  const sessions = await fetchSessions()  // server-side fetch
  return <SessionList sessions={sessions} />
}

// Client Component — runs in browser
'use client'
export function SessionList({ sessions }) {
  const [selected, setSelected] = useState(null)
  return sessions.map(s => (
    <button onClick={() => setSelected(s)}>{s.name}</button>
  ))
}
```

**Rule of thumb:** keep components as Server Components by default. Only add `'use client'` when you need interactivity or browser APIs.

### API Routes

Next.js can also define backend API endpoints in `app/api/`:

```ts
// web/app/api/health/route.ts
export async function GET() {
  return Response.json({ ok: true })
}
```

In this project the web app's API routes just **proxy** to the Go API server (configured in `next.config.ts`). The real backend is Go — Next.js is a pure frontend.

### Data fetching pattern

```tsx
// In a Server Component, fetch data at render time
export default async function DashPage() {
  const res = await fetch('http://localhost:8080/api/layouts')
  const layouts = await res.json()
  return <DashEditor layouts={layouts} />
}
```

---

## TypeScript

Both the web app and desktop app are written in **TypeScript** — JavaScript with type annotations. The compiler catches type errors before the code runs.

```ts
interface TelemetryFrame {
  car: {
    speedMS: number
    gear: number
    rpm: number
  }
  lap: {
    currentLapTime: number
    bestLapTime: number
  }
}

function formatSpeed(frame: TelemetryFrame): string {
  return `${(frame.car.speedMS * 3.6).toFixed(0)} km/h`
}
```

Types for telemetry data are defined in `/packages/types/` and shared between the web app and desktop app so they always stay in sync.

---

## JSX / TSX

JSX is the HTML-like syntax inside `.tsx` files. It compiles to regular function calls:

```tsx
// What you write
const el = <Button variant="ghost" onClick={handleClick}>Save</Button>

// What it compiles to
const el = React.createElement(Button, { variant: 'ghost', onClick: handleClick }, 'Save')
```

Rules:
- Components must start with a capital letter (`Button`, not `button`).
- `button` (lowercase) renders a native HTML `<button>` element.
- `Button` (uppercase) renders the `Button` component from `@sprint/ui`.
- Every JSX expression must have a single root element (or use `<>...</>` fragments).
- Use `className` instead of `class` for CSS classes.
- Event handlers are camelCase: `onClick`, `onChange`, `onSubmit`.

---

## Tailwind CSS

Both apps use **Tailwind CSS** — a utility-first CSS framework. Instead of writing CSS files, you compose classes directly in JSX:

```tsx
// Old way — writing CSS
// .button { background: orange; padding: 8px 12px; border-radius: 6px; }
<button className="button">Click</button>

// Tailwind way — classes ARE the styles
<button className="bg-orange-500 px-3 py-2 rounded-md">Click</button>
```

This project's custom Tailwind tokens (colours, radius, fonts) are defined in `/packages/tokens/tailwind.config.ts` and shared by both apps.

Common patterns you'll see:
- `flex items-center gap-2` → flexbox row with centered items and gap
- `text-xs text-text-muted` → small muted text
- `glass rounded-lg p-4` → dark glass card panel
- `w-full` → full width
- `hover:bg-bg-elevated` → background changes on hover
