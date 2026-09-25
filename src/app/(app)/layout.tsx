import Link from 'next/link';
import { requireUser } from '@/server/auth/current';
import { LogoutButton } from '@/components/logout-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 h-[var(--header-h)] border-b border-ink-700 bg-ink-950/90 backdrop-blur">
        <nav className="mx-auto flex h-full max-w-7xl items-center gap-1 px-4 text-sm">
          <Link href="/play" className="mr-2 font-display text-lg tracking-wide text-ember sm:mr-4">
            Taleweaver
          </Link>
          <Link href="/play" className="rounded-md px-2 py-1.5 text-parchment-dim sm:px-3 hover:bg-ink-800 hover:text-parchment">
            Adventures
          </Link>
          {user.role === 'admin' && (
            <Link href="/admin" className="rounded-md px-2 py-1.5 text-parchment-dim sm:px-3 hover:bg-ink-800 hover:text-parchment">
              Admin
            </Link>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Link href="/account" aria-label="Account" className="rounded-md px-2 py-1.5 text-parchment-dim hover:bg-ink-800 hover:text-parchment sm:px-3">
              <span aria-hidden className="sm:hidden">⚙</span>
              <span className="hidden sm:inline">{user.username}</span>
            </Link>
            <LogoutButton />
          </div>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
