import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { carsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const TAG_OPTIONS = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'photoshoot', label: 'Photo Shoot' },
  { value: 'event', label: 'Special Event' },
  { value: 'other', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - i);

export default function AddCarPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    make: '',
    model: '',
    year: CURRENT_YEAR - 20,
    color: '',
    description: '',
    tags: [] as string[],
    price_per_day_cents: '',
    price_per_hour_cents: '',
    location: '',
  });

  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [createdCarId, setCreatedCarId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      carsAPI.create({
        make: form.make,
        model: form.model,
        year: form.year,
        color: form.color,
        description: form.description || undefined,
        tags: form.tags,
        price_per_day_cents: form.price_per_day_cents ? Math.round(parseFloat(form.price_per_day_cents) * 100) : undefined,
        price_per_hour_cents: form.price_per_hour_cents ? Math.round(parseFloat(form.price_per_hour_cents) * 100) : undefined,
        location: form.location || undefined,
      }),
    onSuccess: async (car) => {
      setCreatedCarId(car.id);
      for (const img of uploadedImages) {
        await carsAPI.uploadImage(car.id, img.file);
      }
      navigate(`/owner`);
    },
  });

  const handleTagToggle = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const previews = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
    setUploadedImages((prev) => [...prev, ...previews].slice(0, 8));
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  if (!user) {
    return (
      <div className="container page">
        <p>Please <Link to="/login">sign in</Link> to list a car.</p>
      </div>
    );
  }

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="breadcrumb">
        <Link to="/owner">← Back to Dashboard</Link>
      </div>

      <h1 className="page-title" style={{ marginTop: 12 }}>List Your Car</h1>
      <p className="page-subtitle">Add your classic car to the UnforgettableRides marketplace.</p>

      <div style={{ marginTop: 40 }}>
        <div className="form-section">
          <div className="form-section-title">Vehicle Details</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label>Make *</label>
              <input
                className="form-control"
                type="text"
                placeholder="e.g. Rolls-Royce"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Model *</label>
              <input
                className="form-control"
                type="text"
                placeholder="e.g. Silver Shadow"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label>Year *</label>
              <select
                className="form-control"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
              >
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Colour *</label>
              <input
                className="form-control"
                type="text"
                placeholder="e.g. Midnight Black"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Location</label>
            <input
              className="form-control"
              type="text"
              placeholder="e.g. London, UK"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Description</label>
            <textarea
              className="form-control"
              placeholder="Tell customers about the car's history, condition, and what makes it special…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
            />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Event Types</div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            Select all occasions your car is suitable for.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag.value}
                type="button"
                className={`booking-option${form.tags.includes(tag.value) ? ' selected' : ''}`}
                onClick={() => handleTagToggle(tag.value)}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Pricing</div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            Set your rates. Leave blank if you prefer to quote per enquiry.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Price per Day ($)</label>
              <input
                className="form-control"
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 850"
                value={form.price_per_day_cents}
                onChange={(e) => setForm({ ...form, price_per_day_cents: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Price per Hour ($)</label>
              <input
                className="form-control"
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 150"
                value={form.price_per_hour_cents}
                onChange={(e) => setForm({ ...form, price_per_hour_cents: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Photos</div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: 14 }}>
            Upload up to 8 photos. The first photo becomes your primary listing image.
          </p>

          {uploadedImages.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              {uploadedImages.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={img.preview}
                    alt=""
                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                  />
                  {i === 0 && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6,
                      background: 'var(--gold)', color: '#0d0d0d',
                      fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    }}>
                      PRIMARY
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      background: 'rgba(0,0,0,0.7)', border: 'none',
                      color: '#fff', borderRadius: '50%', width: 22, height: 22,
                      cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploadedImages.length < 8 && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
              >
                + Add Photos
              </button>
            </>
          )}
        </div>

        {createMutation.error && (
          <p className="error" style={{ marginBottom: 16 }}>
            {(createMutation.error as any).response?.data?.error?.message || 'Failed to create listing. Please try again.'}
          </p>
        )}

        <button
          className="btn btn-primary btn-lg"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !form.make || !form.model || !form.color || form.tags.length === 0}
          style={{ width: '100%' }}
        >
          {createMutation.isPending ? 'Creating Listing…' : 'Create Listing'}
        </button>
        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12 }}>
          Your listing will be reviewed before going live.
        </p>
      </div>
    </div>
  );
}
