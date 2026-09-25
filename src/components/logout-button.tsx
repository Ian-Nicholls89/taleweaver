'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="whitespace-nowrap rounded-md px-2 py-1.5 sm:px-3 text-parchment-dim hover:bg-ink-800 hover:text-parchment"
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
