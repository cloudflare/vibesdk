// src/ui/AppShell.tsx
export default function AppShell() {
  // Simple anchor links for now (no react-router-dom needed)
  const nav = [
    ['/#/dashboard', 'Dashboard'],
    ['/#/ideas', 'Ideas'],
    ['/#/library', 'Content Library'],
    ['/#/uploads', 'Uploads'],
    ['/#/presets', 'Presets'],
    ['/#/schedule', 'Schedule & Autolist'],
    ['/#/agent', 'AI Agent Training'],
    ['/#/brands', 'Brands'],
    ['/#/settings', 'Settings'],
  ];

  return (
    <div className="min-h-screen" style={{ color: 'var(--text)' }}>
      <div className="grid" style={{ gridTemplateColumns: '260px 1fr', minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside
          className="prism-card"
          style={{ margin: '24px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          {/* Logo + Nav */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src="/brand/prism-mark.svg" alt="Prism" style={{ height: '28px' }} />
              <span className="prism-text" style={{ fontSize: '20px', fontWeight: 600 }}>Prism</span>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
              {nav.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="opacity-80 hover:opacity-100"
                  style={{ textDecoration: 'none', color: 'inherit', padding: '.5rem .75rem', borderRadius: '999px' }}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '20px' }}>© 2025 Prism</div>
        </aside>

        {/* Main */}
        <main style={{ margin: '24px' }}>
          <header
            className="prism-card"
            style={{ padding: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <h1 style={{ fontWeight: 600 }}>Vibe Studio</h1>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input className="prism-input" placeholder="Quick idea URL, text, or upload…" style={{ width: '360px' }} />
              <button className="prism-btn">Create</button>
            </div>
          </header>

          <section className="prism-card" style={{ padding: '24px' }}>
            <div style={{ opacity: 0.85 }}>
              <strong>Connected!</strong> This is your Prism shell. 
              Replace this area with your actual pages or SDK components. 
              Links on the left are dummy anchors for now.
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
