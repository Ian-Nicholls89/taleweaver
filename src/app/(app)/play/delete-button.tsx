'use client';

import { useRouter } from 'next/navigation';

export function DeleteButton({ url, confirmText }: { url: string; confirmText: string }) {
  const router = useRouter();
  return (
    <button
      title="Delete"
      aria-label="Delete"
      className="rounded-md px-2 py-1 text-parchment-dim/60 hover:bg-blood/20 hover:text-red-300"
      onClick={async () => {
        if (!confirm(confirmText)) return;
        await fetch(url, { method: 'DELETE' });
        router.refresh();
      }}
    >
      ✕
    </button>
  );
}
