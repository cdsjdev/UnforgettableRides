import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { carsAPI, type ClassicCar } from '../services/api';

const FALLBACK = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&auto=format&fit=crop';

const TAGS = ['all', 'wedding', 'photoshoot', 'event'];

function tagLabel(tag: string) {
  const map: Record<string, string> = { all: 'All Events', wedding: 'Wedding', photoshoot: 'Photo Shoot', event: 'Event', other: 'Other' };
  return map[tag] ?? tag;
}

const YEARS = Array.from({ length: 60 }, (_, i) => 2024 - i);

function CarCard({ car }: { car: ClassicCar }) {
  const image = car.primary_image_url || car.images?.[0]?.url || FALLBACK;
  const pricePerDay = car.price_per_day_cents ? `$${(car.price_per_day_cents / 100).toLocaleString()}` : null;

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
          {car.average_rating != null && (
            <div className="car-rating">
              <span className="star">★</span>
              <span>{Number(car.average_rating).toFixed(1)}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function CarsPage() {
  const [activeTag, setActiveTag] = useState('all');
  const [make, setMake] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');

  const filters = {
    tag: activeTag !== 'all' ? activeTag : undefined,
    make: make || undefined,
    year_min: yearMin ? Number(yearMin) : undefined,
    year_max: yearMax ? Number(yearMax) : undefined,
    limit: 24,
  };

  const { data: cars = [], isLoading } = useQuery({
    queryKey: ['cars', filters],
    queryFn: () => carsAPI.getAll(filters),
  });

  return (
    <>
      <div className="page-header">
        <div className="container">
          <div className="section-eyebrow">Our fleet</div>
          <h1 className="page-title">Classic Cars for Hire</h1>
          <p className="page-subtitle">Every vehicle is owner-driven and available for your special occasion.</p>
        </div>
      </div>

      <div className="container page" style={{ paddingTop: 0 }}>
        {/* Filters */}
        <div className="filter-bar">
          <div className="filter-tabs">
            {TAGS.map((t) => (
              <button
                key={t}
                className={`filter-tab${activeTag === t ? ' active' : ''}`}
                onClick={() => setActiveTag(t)}
              >
                {tagLabel(t)}
              </button>
            ))}
          </div>

          <input
            className="filter-input"
            placeholder="Make (e.g. Rolls-Royce)"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            style={{ minWidth: 180 }}
          />

          <select
            className="filter-input"
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            style={{ width: 120 }}
          >
            <option value="">From year</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <select
            className="filter-input"
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            style={{ width: 120 }}
          >
            <option value="">To year</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {isLoading ? (
          <p className="loading">Finding classic cars<span className="loading-dots" /></p>
        ) : cars.length === 0 ? (
          <div className="empty">
            <h3>No cars match your filters</h3>
            <p>Try adjusting your search criteria.</p>
            <button className="btn btn-ghost" onClick={() => { setActiveTag('all'); setMake(''); setYearMin(''); setYearMax(''); }}>
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="car-grid">
            {cars.map((car) => <CarCard key={car.id} car={car} />)}
          </div>
        )}
      </div>
    </>
  );
}
