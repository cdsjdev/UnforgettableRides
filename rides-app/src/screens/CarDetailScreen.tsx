import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { carsAPI, messagingAPI, getFullImageUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ClassicCar } from '../../../shared/types';

const GOLD = '#c9a84c';

export default function CarDetailScreen({ navigation, route }: any) {
  const { carId } = route.params;
  const { user } = useAuth();
  const [car, setCar] = useState<ClassicCar | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    carsAPI.getById(carId).then(c => { setCar(c); setLoading(false); }).catch(() => setLoading(false));
  }, [carId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;
  }
  if (!car) {
    return <View style={styles.center}><Text style={styles.errorText}>Car not found.</Text></View>;
  }

  const images = car.images || [];
  const currentImg = images[imgIdx]?.url || car.primary_image_url;
  const fullImg = getFullImageUrl(currentImg);
  const tags = Array.isArray(car.tags) ? car.tags : (typeof car.tags === 'string' ? JSON.parse(car.tags || '[]') : []);
  const priceDay = car.price_per_day_cents ? `$${(car.price_per_day_cents / 100).toFixed(0)}/day` : null;
  const priceHr = car.price_per_hour_cents ? `$${(car.price_per_hour_cents / 100).toFixed(0)}/hr` : null;

  const handleBook = () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to book this car.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Profile', { screen: 'Login' }) },
      ]);
      return;
    }
    navigation.navigate('Cars', { screen: 'BookCar', params: { carId: car.id, car } });
  };

  const handleMessage = () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to message the owner.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => navigation.navigate('Profile', { screen: 'Login' }) },
      ]);
      return;
    }
    if (!car.owner_id) return;
    navigation.navigate('Messages', { screen: 'MessageThread', params: { ownerId: car.owner_id, carTitle: `${car.year} ${car.make} ${car.model}` } });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Gallery */}
      <View style={styles.gallery}>
        {fullImg ? (
          <Image source={{ uri: fullImg }} style={styles.mainImage} resizeMode="cover" />
        ) : (
          <View style={[styles.mainImage, styles.imagePlaceholder]}>
            <Ionicons name="car-sport-outline" size={60} color="#8c8576" />
          </View>
        )}
        {images.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnails}>
            {images.map((img, i) => (
              <TouchableOpacity key={img.id} onPress={() => setImgIdx(i)}>
                <Image
                  source={{ uri: getFullImageUrl(img.url) }}
                  style={[styles.thumb, imgIdx === i && styles.thumbActive]}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.body}>
        {/* Title + tags */}
        <Text style={styles.title}>{car.year} {car.make} {car.model}</Text>
        <Text style={styles.subtitle}>{car.color}</Text>
        <View style={styles.tagRow}>
          {tags.map((tag: string) => (
            <View key={tag} style={styles.tagBadge}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {/* Location */}
        {car.location && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={GOLD} />
            <Text style={styles.infoText}>{car.location}</Text>
          </View>
        )}

        {/* Pricing */}
        {(priceDay || priceHr) && (
          <View style={styles.pricing}>
            {priceDay && <Text style={styles.priceText}>{priceDay}</Text>}
            {priceHr && <Text style={styles.priceText}>{priceHr}</Text>}
          </View>
        )}

        {/* Description */}
        {car.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this Car</Text>
            <Text style={styles.description}>{car.description}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.bookBtn} onPress={handleBook}>
            <Text style={styles.bookBtnText}>Request Booking</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.msgBtn} onPress={handleMessage}>
            <Ionicons name="chatbubble-outline" size={18} color={GOLD} />
            <Text style={styles.msgBtnText}>Message Owner</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0d0d0d' },
  errorText: { color: '#b1a998', fontSize: 16 },
  gallery: { backgroundColor: '#0d0d0d' },
  mainImage: { width: '100%', aspectRatio: 16 / 10 },
  imagePlaceholder: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  thumbnails: { paddingVertical: 8, paddingHorizontal: 12 },
  thumb: { width: 60, height: 44, borderRadius: 6, marginRight: 8, opacity: 0.6 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: GOLD },
  body: { padding: 20 },
  title: { color: '#f0ebe0', fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: '#a09070', fontSize: 15, marginBottom: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagBadge: { backgroundColor: 'rgba(201,168,76,0.15)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: GOLD, fontSize: 12, textTransform: 'capitalize', fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  infoText: { color: '#a09070', fontSize: 14 },
  pricing: { flexDirection: 'row', gap: 16, backgroundColor: 'rgba(201,168,76,0.08)', borderRadius: 8, padding: 16, marginBottom: 20 },
  priceText: { color: GOLD, fontSize: 20, fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionTitle: { color: '#f0ebe0', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  description: { color: '#a09070', fontSize: 14, lineHeight: 22 },
  actions: { gap: 12, marginTop: 8 },
  bookBtn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  bookBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 16 },
  msgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: GOLD, borderRadius: 10, paddingVertical: 14 },
  msgBtnText: { color: GOLD, fontWeight: '600', fontSize: 15 },
});
