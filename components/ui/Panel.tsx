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
          {title && (
            <h2 style={{ font: "700 10.5px 'Archivo', sans-serif", color: 'var(--ink-3)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {title}
            </h2>
          )}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
