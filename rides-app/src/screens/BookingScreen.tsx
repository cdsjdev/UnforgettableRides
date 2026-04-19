import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bookingsAPI, carsAPI, getFullImageUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ClassicCar } from '../../../shared/types';

const GOLD = '#c9a84c';
const EVENT_TYPES = ['wedding', 'photoshoot', 'event', 'other'] as const;

export default function BookingScreen({ navigation, route }: any) {
  const { carId } = route.params;
  const { user } = useAuth();
  const [car, setCar] = useState<ClassicCar | null>(route.params.car || null);
  const [loading, setLoading] = useState(!route.params.car);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [eventType, setEventType] = useState<string>('wedding');
  const [eventDate, setEventDate] = useState('');
  const [durationMode, setDurationMode] = useState<'hours' | 'days'>('days');
  const [duration, setDuration] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!car) {
      carsAPI.getById(carId).then(c => { setCar(c); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [carId]);

  const pricePerDay = car?.price_per_day_cents ? car.price_per_day_cents / 100 : null;
  const pricePerHour = car?.price_per_hour_cents ? car.price_per_hour_cents / 100 : null;

  const calcPrice = () => {
    const d = parseFloat(duration);
    if (!d || isNaN(d)) return null;
    if (durationMode === 'days' && pricePerDay) return (pricePerDay * d).toFixed(2);
    if (durationMode === 'hours' && pricePerHour) return (pricePerHour * d).toFixed(2);
    return null;
  };

  const estimatedPrice = calcPrice();

  const handleSubmit = async () => {
    if (!user) { Alert.alert('Sign in required'); return; }
    if (!eventDate) { Alert.alert('Please enter an event date (YYYY-MM-DD)'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) { Alert.alert('Use format YYYY-MM-DD for the date'); return; }

    setSubmitting(true);
    try {
      await bookingsAPI.create({
        car_id: carId,
        event_type: eventType,
        event_date: eventDate,
        duration_hours: durationMode === 'hours' && duration ? parseFloat(duration) : undefined,
        duration_days: durationMode === 'days' && duration ? parseInt(duration) : undefined,
        pickup_location: pickupLocation || undefined,
        notes: notes || undefined,
      });
      setSuccess(true);
    } catch (e: any) {
      Alert.alert('Booking failed', e.message || 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;

  if (success) {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={72} color={GOLD} />
        <Text style={styles.successTitle}>Booking Requested!</Text>
        <Text style={styles.successSub}>The car owner will confirm your booking shortly.</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.navigate('Profile', { screen: 'BookingsList' })}>
          <Text style={styles.doneBtnText}>View My Bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Back to Car</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {car && (
        <View style={styles.carHeader}>
          <Text style={styles.carTitle}>{car.year} {car.make} {car.model}</Text>
          {car.location ? <Text style={styles.carSub}>{car.location}</Text> : null}
        </View>
      )}

      <Text style={styles.label}>Event Type</Text>
      <View style={styles.typeRow}>
        {EVENT_TYPES.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, eventType === t && styles.typeBtnActive]}
            onPress={() => setEventType(t)}
          >
            <Text style={[styles.typeBtnText, eventType === t && styles.typeBtnTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Event Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#555"
        value={eventDate}
        onChangeText={setEventDate}
      />

      <Text style={styles.label}>Duration</Text>
      <View style={styles.durationRow}>
        <TouchableOpacity
          style={[styles.durationToggle, durationMode === 'days' && styles.durationToggleActive]}
          onPress={() => setDurationMode('days')}
        >
          <Text style={[styles.durationToggleText, durationMode === 'days' && { color: '#0d0d0d' }]}>Days</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.durationToggle, durationMode === 'hours' && styles.durationToggleActive]}
          onPress={() => setDurationMode('hours')}
        >
          <Text style={[styles.durationToggleText, durationMode === 'hours' && { color: '#0d0d0d' }]}>Hours</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          placeholder={durationMode === 'days' ? 'e.g. 1' : 'e.g. 4'}
          placeholderTextColor="#555"
          keyboardType="numeric"
          value={duration}
          onChangeText={setDuration}
        />
      </View>

      <Text style={styles.label}>Pickup Location (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="Address or venue name"
        placeholderTextColor="#555"
        value={pickupLocation}
        onChangeText={setPickupLocation}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        placeholder="Any special requirements…"
        placeholderTextColor="#555"
        multiline
        numberOfLines={3}
        value={notes}
        onChangeText={setNotes}
      />

      {estimatedPrice && (
        <View style={styles.priceBox}>
          <Text style={styles.priceLabel}>Estimated Total</Text>
          <Text style={styles.priceValue}>${estimatedPrice}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? <ActivityIndicator color="#0d0d0d" /> : <Text style={styles.submitBtnText}>Request Booking</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d', padding: 32 },
  carHeader: { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)' },
  carTitle: { color: '#f0ebe0', fontSize: 18, fontWeight: '700' },
  carSub: { color: '#a09070', fontSize: 13, marginTop: 4 },
  label: { color: '#f0ebe0', fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 14, color: '#f0ebe0', fontSize: 14, marginBottom: 4 },
  textarea: { height: 80, textAlignVertical: 'top' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  typeBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  typeBtnText: { color: '#a09070', fontSize: 13, textTransform: 'capitalize' },
  typeBtnTextActive: { color: '#0d0d0d', fontWeight: '700' },
  durationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  durationToggle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14 },
  durationToggleActive: { backgroundColor: GOLD, borderColor: GOLD },
  durationToggleText: { color: '#a09070', fontWeight: '600' },
  priceBox: { backgroundColor: 'rgba(201,168,76,0.1)', borderRadius: 8, padding: 16, marginVertical: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { color: '#a09070', fontSize: 14 },
  priceValue: { color: GOLD, fontSize: 22, fontWeight: '700' },
  submitBtn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 17 },
  successTitle: { color: '#f0ebe0', fontSize: 26, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  successSub: { color: '#a09070', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  doneBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 16 },
  backLink: { marginTop: 16 },
  backLinkText: { color: '#a09070', fontSize: 14 },
});
