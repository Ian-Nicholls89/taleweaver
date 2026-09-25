import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-display text-5xl text-ember">404</p>
      <p className="text-parchment-dim">This path leads nowhere. Even the goblins avoid it.</p>
      <Link href="/play" className="text-ember hover:underline">
        Return to the tavern
      </Link>
    </main>
  );
}
