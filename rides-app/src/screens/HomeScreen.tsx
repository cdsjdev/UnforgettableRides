import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, ActivityIndicator, FlatList, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { carsAPI, getFullImageUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { ClassicCar } from '../../../shared/types';
import AccountQuickAccess from '../components/AccountQuickAccess';

const GOLD = '#c9a84c';
const TAGS = ['wedding', 'photoshoot', 'event', 'other'] as const;

function CarCard({ car, onPress }: { car: ClassicCar; onPress: () => void }) {
  const img = car.primary_image_url || (car.images?.[0]?.url);
  const fullImg = getFullImageUrl(img);
  const priceDay = car.price_per_day_cents ? `From $${Math.round(car.price_per_day_cents / 100)}/day` : null;
  const tags = Array.isArray(car.tags) ? car.tags : (typeof car.tags === 'string' ? JSON.parse(car.tags || '[]') : []);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {fullImg ? (
        <Image source={{ uri: fullImg }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="car-sport-outline" size={40} color="#8c8576" />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{car.year} {car.make} {car.model}</Text>
        {car.location ? <Text style={styles.cardLocation}><Ionicons name="location-outline" size={12} /> {car.location}</Text> : null}
        <View style={styles.cardRow}>
          {tags.slice(0, 2).map((tag: string) => (
            <View key={tag} style={styles.tagBadge}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {priceDay && <Text style={styles.price}>{priceDay}</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  const [featured, setFeatured] = useState<ClassicCar[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setLoading(true);
    carsAPI.getFeatured().then(cars => {
      if (!cancelled) { setFeatured(cars); setLoading(false); }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []));

  const numCols = width >= 768 ? 3 : 2;

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: Math.max(38, insets.top + 22) }]}>
        <View style={styles.accountAccessWrap}>
          <AccountQuickAccess />
        </View>
        <Text style={styles.heroSub}>Premium Classic Car Hire</Text>
        <Text style={styles.heroTitle}>Arrive in{'\n'}Timeless Style</Text>
        <TouchableOpacity style={styles.heroBtn} onPress={() => navigation.navigate('Cars')}>
          <Text style={styles.heroBtnText}>Browse Cars</Text>
        </TouchableOpacity>
      </View>

      {/* Event type quick filters */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse by Occasion</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
          {TAGS.map(tag => (
            <TouchableOpacity
              key={tag}
              style={styles.tagFilter}
              onPress={() => navigation.navigate('Cars', { screen: 'CarsMain', params: { tag } })}
            >
              <Text style={styles.tagFilterText}>{tag.charAt(0).toUpperCase() + tag.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Featured cars */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Featured Cars</Text>
        {loading ? (
          <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
        ) : featured.length === 0 ? (
          <Text style={styles.emptyText}>No featured cars yet.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {featured.map(car => (
              <View key={car.id} style={{ width: (width - 48 - (numCols - 1) * 12) / numCols }}>
                <CarCard car={car} onPress={() => navigation.navigate('Cars', { screen: 'CarDetail', params: { carId: car.id } })} />
              </View>
            ))}
          </View>
        )}
        {featured.length > 0 && (
          <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('Cars')}>
            <Text style={styles.viewAllText}>View All Cars {'->'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Owner CTA */}
      {!user && (
        <View style={styles.ownerBanner}>
          <Ionicons name="car-outline" size={32} color={GOLD} />
          <Text style={styles.ownerTitle}>Own a Classic Car?</Text>
          <Text style={styles.ownerSub}>List it on UnforgettableRides and earn from hire bookings</Text>
          <TouchableOpacity style={styles.ownerBtn} onPress={() => navigation.navigate('Profile', { screen: 'Register', params: { role: 'owner' } })}>
            <Text style={styles.ownerBtnText}>List Your Car</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { paddingBottom: 40 },
  hero: {
    minHeight: 278,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.2)',
  },
  accountAccessWrap: {
    width: '100%',
    alignItems: 'flex-end',
    marginRight: -16,
    marginBottom: 12,
  },
  heroSub: { color: GOLD, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' },
  heroTitle: { color: '#f0ebe0', fontSize: 34, fontWeight: '700', textAlign: 'center', marginBottom: 24, lineHeight: 42 },
  heroBtn: { backgroundColor: GOLD, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8 },
  heroBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 16 },
  section: { padding: 20, paddingBottom: 0 },
  sectionTitle: { color: '#f0ebe0', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  tagRow: { flexDirection: 'row', marginBottom: 8 },
  tagFilter: { backgroundColor: 'rgba(201,168,76,0.15)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginRight: 10 },
  tagFilterText: { color: GOLD, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  card: { backgroundColor: '#1a1a1a', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 4 },
  cardImage: { width: '100%', aspectRatio: 16 / 10 },
  cardImagePlaceholder: { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 10 },
  cardTitle: { color: '#f0ebe0', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  cardLocation: { color: '#a09070', fontSize: 11, marginBottom: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  tagBadge: { backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { color: GOLD, fontSize: 10, textTransform: 'capitalize' },
  price: { color: GOLD, fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  emptyText: { color: '#b1a998', fontSize: 14, textAlign: 'center', marginTop: 20 },
  viewAllBtn: { marginTop: 16, alignSelf: 'center', padding: 12 },
  viewAllText: { color: GOLD, fontSize: 15, fontWeight: '600' },
  ownerBanner: { margin: 20, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)' },
  ownerTitle: { color: '#f0ebe0', fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  ownerSub: { color: '#a09070', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  ownerBtn: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 12 },
  ownerBtnText: { color: GOLD, fontWeight: '700', fontSize: 15 },
});

