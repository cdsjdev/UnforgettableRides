import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Our story</div>
          <h1 className="page-title">About UnforgettableRides</h1>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80, maxWidth: 800 }}>
        <div style={{ display: 'grid', gap: 32, fontSize: '1rem', lineHeight: 1.85, color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.15rem', color: 'var(--text)', fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
            Every great occasion deserves an arrival that turns heads and creates memories that last a lifetime. That's why UnforgettableRides exists.
          </p>

          <p>
            We are a marketplace connecting classic car enthusiasts with people who want to add a touch of timeless elegance to their most important moments. Whether it's a grand wedding entrance, a luxury fashion shoot, a film production, or a milestone anniversary — we believe the right vehicle elevates the entire experience.
          </p>

          <p>
            What makes us different is simple: every car on our platform is <strong style={{ color: 'var(--text)' }}>owner-driven</strong>. These aren't fleet vehicles serviced by strangers. They are passionately maintained machines, driven by the people who love them most. That personal touch is what turns a hire car into an unforgettable moment.
          </p>

          <p>
            Our platform handles the discovery, communication, and booking — so owners can focus on what they do best (keeping their cars immaculate) and customers can focus on enjoying their special day.
          </p>

          <hr className="section-divider" style={{ margin: '16px 0' }} />

          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', marginBottom: 20, color: 'var(--text)' }}>Our Values</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
              {[
                { title: 'Authenticity', desc: 'Every car has a story. We celebrate that history rather than hide it.' },
                { title: 'Personal Service', desc: 'Owner-driven means the person who cares most about the car is always behind the wheel.' },
                { title: 'Trust', desc: 'Transparent pricing, verified owners, and clear communication at every step.' },
                { title: 'Excellence', desc: 'We curate our fleet to ensure every vehicle meets our quality standards.' },
              ].map((v) => (
                <div
                  key={v.title}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 24,
                  }}
                >
                  <h3 style={{ fontFamily: 'Georgia, serif', color: 'var(--gold)', marginBottom: 8, fontSize: '1rem' }}>{v.title}</h3>
                  <p style={{ fontSize: '0.86rem', lineHeight: 1.65 }}>{v.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ textAlign: 'center', paddingTop: 16 }}>
            <Link to="/cars" className="btn btn-primary btn-lg">Browse Our Fleet</Link>
          </div>
        </div>
      </div>
    </>
  );
}
