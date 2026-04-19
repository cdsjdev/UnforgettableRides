import { Link } from 'react-router-dom';

export default function HowItWorksPage() {
  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Simple process</div>
          <h1 className="page-title">How It Works</h1>
          <p className="page-subtitle">From browsing to arrival — everything you need to know.</p>
        </div>
      </div>

      <div className="container" style={{ paddingBottom: 80 }}>
        {/* For Customers */}
        <div style={{ marginBottom: 72 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', marginBottom: 36, color: 'var(--gold)' }}>
            For Customers
          </h2>
          <div className="how-steps">
            {[
              { n: 1, title: 'Browse Our Fleet', desc: 'Filter by event type (wedding, photo shoot, event), make, year range, and location. Every listing includes full photo galleries, pricing, and owner details.' },
              { n: 2, title: 'Message the Owner', desc: 'Reach out directly to the car owner through our in-app messaging. Ask questions, discuss your event, and agree on logistics before committing.' },
              { n: 3, title: 'Request a Quote', desc: 'For custom pricing or special arrangements, send a quote request. Owners typically respond within 24 hours.' },
              { n: 4, title: 'Confirm Your Booking', desc: 'Once agreed, confirm your booking online. No payment is taken until the owner accepts your request.' },
              { n: 5, title: 'Arrive in Style', desc: "On the day, your owner-driven classic car arrives at your venue. Relax and enjoy the moment — you've earned it." },
            ].map((step) => (
              <div key={step.n} className="how-step">
                <div className="how-step-num">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <hr className="section-divider" style={{ marginBottom: 72 }} />

        {/* For Owners */}
        <div style={{ marginBottom: 72 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', marginBottom: 36, color: 'var(--gold)' }}>
            For Car Owners
          </h2>
          <div className="how-steps">
            {[
              { n: 1, title: 'Create Your Listing', desc: 'Register as a car owner and list your vehicle with photos, description, pricing, and available dates. It takes less than 10 minutes.' },
              { n: 2, title: 'Set Your Availability', desc: 'Block out dates when your car is unavailable. Customers will only see dates that work for you.' },
              { n: 3, title: 'Receive Booking Requests', desc: "When a customer requests your car, you'll be notified immediately. Review the details and accept or decline at your discretion." },
              { n: 4, title: 'Attend the Event', desc: "You drive your own car to the event. This keeps the experience personal, safe, and exactly as you'd want it." },
              { n: 5, title: 'Get Paid', desc: "Payouts are processed automatically after the event is confirmed complete. We handle the payment infrastructure so you don't have to." },
            ].map((step) => (
              <div key={step.n} className="how-step">
                <div className="how-step-num">{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <hr className="section-divider" style={{ marginBottom: 72 }} />

        {/* FAQ */}
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', marginBottom: 36, textAlign: 'center' }}>
            Frequently Asked Questions
          </h2>
          {[
            { q: 'Is the car owner present at the event?', a: 'Yes — all our hires are owner-driven. This ensures the vehicle is handled with the utmost care and gives events a personal, premium feel.' },
            { q: 'How far in advance should I book?', a: 'We recommend booking at least 4–8 weeks in advance for weddings and large events. Some popular cars book out months ahead.' },
            { q: 'What if I need to cancel?', a: 'Cancellation terms are set by each car owner. Check the listing before booking. Most owners allow cancellation up to 14 days before the event.' },
            { q: 'Are the cars insured?', a: 'Each car owner is responsible for their own insurance. We recommend confirming coverage with your owner before confirming a booking.' },
            { q: 'How do I list my car?', a: 'Create an account, select "List Your Car" and follow the steps. Listings are reviewed before going live to maintain quality.' },
          ].map((faq, i) => (
            <details
              key={i}
              style={{
                borderBottom: '1px solid var(--border)',
                padding: '20px 0',
              }}
            >
              <summary style={{
                cursor: 'pointer',
                fontWeight: 700,
                color: 'var(--text)',
                fontSize: '0.95rem',
                listStyle: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                {faq.q}
                <span style={{ color: 'var(--gold)', marginLeft: 12, flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                {faq.a}
              </p>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: 72 }}>
          <Link to="/cars" className="btn btn-primary btn-lg">Browse Classic Cars</Link>
          <span style={{ margin: '0 16px', color: 'var(--text-muted)' }}>or</span>
          <Link to="/register?role=owner" className="btn btn-outline btn-lg">List Your Car</Link>
        </div>
      </div>
    </>
  );
}
