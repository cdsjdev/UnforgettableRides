import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { carsAPI, type ClassicCar } from '../services/api';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1800&auto=format&fit=crop&q=80';
const FALLBACK_CAR = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&auto=format&fit=crop';

function tagLabel(tag: string) {
  const map: Record<string, string> = { wedding: 'Wedding', photoshoot: 'Photo Shoot', event: 'Event', other: 'Other' };
  return map[tag] ?? tag;
}

function CarCard({ car }: { car: ClassicCar }) {
  const image = car.primary_image_url || car.images?.[0]?.url || FALLBACK_CAR;
  const pricePerDay = car.price_per_day_cents ? `$${(car.price_per_day_cents / 100).toLocaleString()}` : null;
  const rating = car.average_rating ? car.average_rating.toFixed(1) : null;

  return (
    <Link to={`/cars/${car.id}`} className="car-card">
      <div className="car-card-img-wrap">
        <img src={image} alt={`${car.year} ${car.make} ${car.model}`} loading="lazy" />
        <div className="car-badges">
          {car.tags.slice(0, 2).map((t) => (
            <span key={t} className={`car-badge ${t}`}>{tagLabel(t)}</span>
          ))}
        </div>
      </div>
      <div className="car-card-body">
        <div className="car-card-title">{car.year} {car.make} {car.model}</div>
        <div className="car-card-meta">
          <span>{car.color}</span>
          {car.location && <><span style={{ opacity: 0.4 }}>·</span><span>{car.location}</span></>}
        </div>
        <div className="car-card-footer">
          <div className="price-tag">
            {pricePerDay ? <>from <strong>{pricePerDay}</strong>/day</> : <span>Quote on request</span>}
          </div>
          {rating && (
            <div className="car-rating">
              <span className="star">★</span>
              <span>{rating}</span>
              {car.review_count ? <span>({car.review_count})</span> : null}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { data: featured = [], isLoading } = useQuery({
    queryKey: ['cars', 'featured'],
    queryFn: () => carsAPI.getFeatured(),
  });

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div
          className="hero-bg"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
        />
        <div className="hero-overlay" />
        <div className="hero-content">
          <div className="hero-eyebrow">Classic Car Hire</div>
          <h1 className="hero-headline">Arrive in<br />Timeless Style</h1>
          <p className="hero-sub">
            Hire iconic classic cars for weddings, photo shoots, and premium events.
            Owner-driven. Unforgettable.
          </p>
          <div className="hero-actions">
            <Link to="/cars" className="btn btn-primary btn-xl">Browse Classic Cars</Link>
            <Link to="/how-it-works" className="btn btn-outline btn-lg">How It Works</Link>
          </div>
        </div>
        <div className="hero-scroll">
          <span>Scroll</span>
          <div className="hero-scroll-line" />
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── Featured Cars ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">Hand-picked collection</div>
            <h2 className="section-title">Featured Vehicles</h2>
            <p className="section-sub">From 1950s roadsters to iconic 1970s grand tourers — each car tells a story.</p>
          </div>

          {isLoading ? (
            <p className="loading">Loading vehicles<span className="loading-dots" /></p>
          ) : featured.length > 0 ? (
            <div className="car-grid">
              {featured.map((car) => <CarCard key={car.id} car={car} />)}
            </div>
          ) : (
            <div className="empty">
              <h3>Collection Coming Soon</h3>
              <p>Our curated fleet is being assembled. Check back shortly.</p>
            </div>
          )}

          {featured.length > 0 && (
            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <Link to="/cars" className="btn btn-outline btn-lg">View All Cars</Link>
            </div>
          )}
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── How It Works ── */}
      <section className="section section-dark">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">Simple process</div>
            <h2 className="section-title">How It Works</h2>
          </div>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-step-num">1</div>
              <h3>Browse Our Fleet</h3>
              <p>Filter by event type, era, or location. Every car comes with full photos, owner info, and pricing.</p>
            </div>
            <div className="how-step">
              <div className="how-step-num">2</div>
              <h3>Message &amp; Book</h3>
              <p>Message the owner directly, request a personalised quote, or book instantly online.</p>
            </div>
            <div className="how-step">
              <div className="how-step-num">3</div>
              <h3>Arrive in Style</h3>
              <p>Your owner-driven classic car arrives at your venue on the day. Sit back and make memories.</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link to="/how-it-works" className="btn btn-outline">Learn More</Link>
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── Testimonials ── */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <div className="section-eyebrow">Real stories</div>
            <h2 className="section-title">What Our Clients Say</h2>
          </div>
          <div className="testimonials-grid">
            {[
              {
                text: "Our 1965 Rolls-Royce Silver Shadow was absolutely breathtaking. The owner was so professional and the car was immaculate. Every guest was asking about it.",
                name: "Sophie &amp; James",
                event: "Wedding, Surrey",
                initials: "SJ",
              },
              {
                text: "We hired the Jaguar E-Type for a luxury fashion shoot and it was perfect — the car is a work of art. The whole experience was seamless from booking to wrap.",
                name: "Marcus Chen",
                event: "Editorial Shoot, London",
                initials: "MC",
              },
              {
                text: "The 1970 Ferrari Dino turned heads the entire day. Incredible car, wonderful owner, and the UnforgettableRides platform made it all so easy to arrange.",
                name: "Priya Nair",
                event: "Anniversary Celebration, Edinburgh",
                initials: "PN",
              },
            ].map((t, i) => (
              <div key={i} className="testimonial-card">
                <div className="testimonial-quote">"</div>
                <p className="testimonial-text" dangerouslySetInnerHTML={{ __html: t.text }} />
                <div className="testimonial-author">
                  <div className="testimonial-initials">{t.initials}</div>
                  <div>
                    <div className="testimonial-name" dangerouslySetInnerHTML={{ __html: t.name }} />
                    <div className="testimonial-event">{t.event}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <hr className="section-divider" />

      {/* ── Owner CTA ── */}
      <section className="section-sm">
        <div className="container">
          <div className="cta-banner">
            <h2>Own a Classic Car?</h2>
            <p>Join our community of owners and earn by sharing your vehicle at premium events.</p>
            <Link to="/register?role=owner" className="btn btn-primary btn-lg">List Your Car Today</Link>
          </div>
        </div>
      </section>
    </>
  );
}
