import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { carsAPI, quotesAPI, messagingAPI, type ClassicCar, type Review } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const FALLBACK = 'https://images.pexels.com/photos/8867048/pexels-photo-8867048.jpeg?auto=compress&cs=tinysrgb&w=1200';

function tagLabel(tag: string) {
  const map: Record<string, string> = { wedding: 'Wedding', photoshoot: 'Photo Shoot', event: 'Event', other: 'Other' };
  return map[tag] ?? tag;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ opacity: i < Math.round(rating) ? 1 : 0.25 }}>★</span>
      ))}
    </span>
  );
}

export default function CarDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [primaryIdx, setPrimaryIdx] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState('');
  const [quoteSent, setQuoteSent] = useState(false);

  const { data: car, isLoading, error } = useQuery({
    queryKey: ['car', id],
    queryFn: () => carsAPI.getById(id!),
    enabled: !!id,
  });

  const { data: blockedDates = [] } = useQuery({
    queryKey: ['car-availability', id],
    queryFn: () => carsAPI.getAvailability(id!),
    enabled: !!id,
  });

  const quoteMutation = useMutation({
    mutationFn: () => quotesAPI.create({ car_id: id!, message: quoteMsg }),
    onSuccess: () => setQuoteSent(true),
  });

  const startThreadMutation = useMutation({
    mutationFn: async (ownerId: string) => messagingAPI.createThread(ownerId),
    onSuccess: (result) => {
      if (result?.threadId) navigate(`/messages/${result.threadId}`);
      else navigate('/messages');
    },
    onError: () => navigate('/messages'),
  });

  if (isLoading) return <div className="container" style={{ paddingTop: 120 }}><p className="loading">Loading<span className="loading-dots" /></p></div>;
  if (error || !car) return <div className="container" style={{ paddingTop: 120 }}><p className="error">Car not found.</p></div>;

  const images = car.images?.length ? car.images.sort((a, b) => a.sort_order - b.sort_order) : [];
  const currentImage = images[primaryIdx]?.url || car.primary_image_url || FALLBACK;
  const pricePerDay = car.price_per_day_cents ? (car.price_per_day_cents / 100) : null;
  const pricePerHour = car.price_per_hour_cents ? (car.price_per_hour_cents / 100) : null;
  const reviews: Review[] = (car as any).reviews ?? [];

  return (
    <div className="car-detail-wrap">
      <div className="container">
        <div className="breadcrumb">
          <Link to="/cars">Browse Cars</Link>
          <span className="breadcrumb-sep">›</span>
          <span>{car.year} {car.make} {car.model}</span>
        </div>

        <div className="car-detail-layout">
          {/* ── Left: Gallery + Info ── */}
          <div>
            <div className="car-detail-gallery">
              <img className="car-detail-primary" src={currentImage} alt={`${car.year} ${car.make} ${car.model}`} />
              {images.length > 1 && (
                <div className="car-detail-thumbs">
                  {images.map((img, i) => (
                    <img
                      key={img.id}
                      className={`car-detail-thumb${i === primaryIdx ? ' active' : ''}`}
                      src={img.url}
                      alt=""
                      onClick={() => setPrimaryIdx(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="car-detail-info">
              <h1 className="car-detail-title">{car.year} {car.make} {car.model}</h1>

              <div className="car-detail-tags">
                {car.tags.map((t) => (
                  <span key={t} className={`car-badge ${t}`}>{tagLabel(t)}</span>
                ))}
              </div>

              <div className="car-detail-meta">
                <span>🎨 {car.color}</span>
                {car.location && <span>📍 {car.location}</span>}
                {car.average_rating != null && (
                  <span>
                    <Stars rating={car.average_rating} />
                    {' '}{Number(car.average_rating).toFixed(1)} ({car.review_count} reviews)
                  </span>
                )}
              </div>

              {car.description && (
                <p className="car-detail-desc">{car.description}</p>
              )}

              {/* Owner */}
              {car.owner && (
                <div className="owner-card">
                  <div className="owner-avatar">
                    {car.owner.avatar_url
                      ? <img src={car.owner.avatar_url} alt={car.owner.name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : car.owner.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="owner-info">
                    <div className="owner-name">{car.owner.name}</div>
                    <div className="owner-meta">Car Owner</div>
                  </div>
                  {user ? (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => car.owner?.id && startThreadMutation.mutate(car.owner.id)}
                    >
                      {startThreadMutation.isPending ? 'Opening...' : 'Message Owner'}
                    </button>
                  ) : (
                    <Link to="/login" className="btn btn-outline btn-sm">Sign In to Message</Link>
                  )}
                </div>
              )}

              {/* Reviews */}
              {reviews.length > 0 && (
                <div>
                  <h3 style={{ marginBottom: 16, fontSize: '1rem', fontFamily: 'Georgia, serif' }}>Reviews</h3>
                  <div className="reviews-list">
                    {reviews.map((r) => (
                      <div key={r.id} className="review-card">
                        <div className="review-header">
                          <Stars rating={r.rating} />
                          <span className="review-author">{r.reviewer?.name ?? 'Anonymous'}</span>
                          <span className="review-date">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                        {r.text && <p className="review-text">{r.text}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Booking Sidebar ── */}
          <div>
            <div className="booking-sidebar">
              <div className="booking-sidebar-header">
                <div className="booking-sidebar-price">
                  {pricePerDay
                    ? <>${pricePerDay.toLocaleString()} <small>/day</small></>
                    : pricePerHour
                    ? <>${pricePerHour.toLocaleString()} <small>/hour</small></>
                    : <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Price on request</span>
                  }
                </div>
                {pricePerDay && pricePerHour && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Also ${pricePerHour.toLocaleString()}/hour
                  </div>
                )}
              </div>

              <div className="booking-sidebar-body">
                {blockedDates.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <span className="booking-field-label">Unavailable dates</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {blockedDates.slice(0, 6).map((d) => (
                        <span key={d} style={{ fontSize: '0.72rem', background: 'var(--danger-bg)', color: 'var(--danger)', padding: '3px 10px', borderRadius: 99, border: '1px solid rgba(248,113,113,0.2)' }}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}

                {user ? (
                  <>
                    <Link
                      to={`/book/${car.id}`}
                      className="btn btn-primary"
                      style={{ width: '100%', marginBottom: 12 }}
                    >
                      Request Booking
                    </Link>

                    {!quoteOpen && !quoteSent && (
                      <button
                        className="btn btn-outline"
                        style={{ width: '100%' }}
                        onClick={() => setQuoteOpen(true)}
                      >
                        Request a Quote
                      </button>
                    )}

                    {quoteOpen && !quoteSent && (
                      <div>
                        <textarea
                          className="form-control"
                          placeholder="Describe your event, date, and any special requirements…"
                          value={quoteMsg}
                          onChange={(e) => setQuoteMsg(e.target.value)}
                          rows={4}
                          style={{ marginBottom: 10 }}
                        />
                        {quoteMutation.error && (
                          <p className="error" style={{ marginBottom: 8 }}>Failed to send. Please try again.</p>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                            onClick={() => quoteMutation.mutate()}
                            disabled={!quoteMsg.trim() || quoteMutation.isPending}
                          >
                            {quoteMutation.isPending ? 'Sending…' : 'Send Quote Request'}
                          </button>
                          <button className="btn btn-ghost" onClick={() => setQuoteOpen(false)}>Cancel</button>
                        </div>
                      </div>
                    )}

                    {quoteSent && (
                      <div className="success-card" style={{ padding: '20px 16px' }}>
                        <h2 style={{ fontSize: '1rem' }}>Quote Request Sent ✓</h2>
                        <p style={{ marginTop: 6 }}>The owner will be in touch shortly.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <Link to="/login" className="btn btn-primary" style={{ width: '100%' }}>
                    Sign In to Book
                  </Link>
                )}

                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 16 }}>
                  No charge until the owner confirms your booking.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
