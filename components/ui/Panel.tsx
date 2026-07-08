export default function Panel({
  title, right, children, className = '',
}: {
  title?: string; right?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section
      className={`rounded-xl border p-4 backdrop-blur-md ${className}`}
      style={{ borderColor: 'var(--ink-2)', background: 'color-mix(in oklch, var(--ink-1) 85%, transparent)' }}
    >
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between">
          {title && <h2 className="mono text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--ink-3)' }}>{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
