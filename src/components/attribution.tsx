export function Attribution({ className = '' }: { className?: string }) {
  return (
    <p className={`px-4 py-3 text-center text-xs text-parchment-dim/60 ${className}`}>
      Rules content from the System Reference Document 5.2 by Wizards of the Coast LLC, licensed under{' '}
      <a className="underline" href="https://creativecommons.org/licenses/by/4.0/legalcode" target="_blank" rel="noreferrer">
        CC-BY-4.0
      </a>
      .
    </p>
  );
}
