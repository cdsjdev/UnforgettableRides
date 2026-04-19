import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { CarImage } from '../services/api';

const TAG_OPTIONS = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'photoshoot', label: 'Photo Shoot' },
  { value: 'event', label: 'Special Event' },
  { value: 'other', label: 'Other' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 100 }, (_, i) => CURRENT_YEAR - i);

export default function EditCarPage() {
  const { carId } = useParams<{ carId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: car, isLoading } = useQuery({
    queryKey: ['car', carId],
    queryFn: () => carsAPI.getById(carId!),
    enabled: !!carId,
  });

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

  const [newImages, setNewImages] = useState<{ file: File; preview: string }[]>([]);

  useEffect(() => {
    if (car) {
      setForm({
        make: car.make,
        model: car.model,
        year: car.year,
        color: car.color,
        description: car.description ?? '',
        tags: car.tags ?? [],
        price_per_day_cents: car.price_per_day_cents ? String(car.price_per_day_cents / 100) : '',
        price_per_hour_cents: car.price_per_hour_cents ? String(car.price_per_hour_cents / 100) : '',
        location: car.location ?? '',
      });
    }
  }, [car]);

  const updateMutation = useMutation({
    mutationFn: () =>
      carsAPI.update(carId!, {
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
    onSuccess: async () => {
      for (const img of newImages) {
        await carsAPI.uploadImage(carId!, img.file);
      }
      qc.invalidateQueries({ queryKey: ['car', carId] });
      qc.invalidateQueries({ queryKey: ['owner-cars'] });
      navigate('/owner');
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => carsAPI.deleteImage(carId!, imageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['car', carId] }),
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
    const existingCount = (car?.images ?? []).length;
    setNewImages((prev) => [...prev, ...previews].slice(0, Math.max(0, 8 - existingCount)));
  };

  const removeNewImage = (index: number) => {
    setNewImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  if (!user) {
    return <div className="container page"><p>Please <Link to="/login">sign in</Link>.</p></div>;
  }

  if (isLoading || !car) {
    return <div className="container page"><p className="loading">Loading<span className="loading-dots" /></p></div>;
  }

  const totalImages = (car.images ?? []).length + newImages.length;

  return (
    <div className="container page" style={{ maxWidth: 760 }}>
      <div className="breadcrumb">
        <Link to="/owner">← Back to Dashboard</Link>
      </div>

      <h1 className="page-title" style={{ marginTop: 12 }}>Edit Listing</h1>
      <p className="page-subtitle">{car.year} {car.make} {car.model}</p>

      <div style={{ marginTop: 40 }}>
        <div className="form-section">
          <div className="form-section-title">Vehicle Details</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label>Make *</label>
              <input
                className="form-control"
                type="text"
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
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Description</label>
            <textarea
              className="form-control"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
            />
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Event Types</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Price per Day ($)</label>
              <input
                className="form-control"
                type="number"
                min={0}
                step={0.01}
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
                value={form.price_per_hour_cents}
                onChange={(e) => setForm({ ...form, price_per_hour_cents: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title">Photos</div>

          {/* Existing images */}
          {(car.images ?? []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>Current photos</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {(car.images as CarImage[]).map((img, i) => (
                  <div key={img.id} style={{ position: 'relative' }}>
                    <img
                      src={img.url}
                      alt=""
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius)', border: `1px solid ${img.is_primary ? 'var(--gold)' : 'var(--border)'}` }}
                    />
                    {img.is_primary && (
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
                      onClick={() => deleteImageMutation.mutate(img.id)}
                      disabled={deleteImageMutation.isPending}
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
            </div>
          )}

          {/* New images preview */}
          {newImages.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>New photos to upload</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {newImages.map((img, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img
                      src={img.preview}
                      alt=""
                      style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(i)}
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
            </div>
          )}

          {totalImages < 8 && (
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

        {updateMutation.error && (
          <p className="error" style={{ marginBottom: 16 }}>
            {(updateMutation.error as any).response?.data?.error?.message || 'Update failed. Please try again.'}
          </p>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !form.make || !form.model || !form.color}
            style={{ flex: 1 }}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
          <Link to="/owner" className="btn btn-outline btn-lg">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
