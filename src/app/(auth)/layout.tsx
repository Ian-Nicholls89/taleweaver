export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl tracking-wide text-ember">Taleweaver</h1>
          <p className="mt-2 text-sm text-parchment-dim">Tales told by lamplight, for one brave soul.</p>
        </div>
        {children}
      </div>
    </main>
  );
}
