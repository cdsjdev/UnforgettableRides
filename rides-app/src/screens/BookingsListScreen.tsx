import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { bookingsAPI, getFullImageUrl } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Booking } from '../../../shared/types';

const GOLD = '#c9a84c';

const STATUS_COLOR: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  completed: '#10b981',
  cancelled: '#ef4444',
};

export default function BookingsListScreen({ navigation }: any) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await bookingsAPI.getAll();
      setBookings(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) {
    return (
      <View style={styles.center}>
        <Ionicons name="calendar-outline" size={48} color="#333" />
        <Text style={styles.emptyTitle}>Sign in to view bookings</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => navigation.navigate('Profile', { screen: 'Login' })}>
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;

  const renderItem = ({ item: b }: { item: Booking }) => {
    const carName = (b as any).car_make ? `${(b as any).car_year} ${(b as any).car_make} ${(b as any).car_model}` : 'Car';
    const statusColor = STATUS_COLOR[b.status] || '#6b7280';
    const price = b.total_price_cents ? `$${(b.total_price_cents / 100).toFixed(2)}` : null;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.carName}>{carName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>{b.status}</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={14} color="#a09070" />
          <Text style={styles.cardMeta}>{b.event_date}</Text>
          <Text style={styles.cardDot}>·</Text>
          <Text style={[styles.cardMeta, { textTransform: 'capitalize' }]} numberOfLines={1}>{b.event_type}</Text>
        </View>
        {(b.duration_days || b.duration_hours) && (
          <Text style={styles.cardMeta}>
            {b.duration_days ? `${b.duration_days} day${b.duration_days > 1 ? 's' : ''}` : `${b.duration_hours}h`}
          </Text>
        )}
        {price && <Text style={styles.cardPrice}>{price}</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {bookings.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color="#333" />
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <TouchableOpacity style={styles.browseBtn} onPress={() => navigation.navigate('Cars')}>
            <Text style={styles.browseBtnText}>Browse Cars</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={b => b.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GOLD} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  carName: { color: '#f0ebe0', fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardMeta: { color: '#a09070', fontSize: 13 },
  cardDot: { color: '#555' },
  cardPrice: { color: GOLD, fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyTitle: { color: '#666', fontSize: 16, marginTop: 12, marginBottom: 20 },
  browseBtn: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 12 },
  browseBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
  signInBtn: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 12, marginTop: 12 },
  signInBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
});
