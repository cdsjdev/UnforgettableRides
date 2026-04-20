import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, TextInput, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { carsAPI, getFullImageUrl } from '../services/api';
import type { ClassicCar } from '../../../shared/types';

const GOLD = '#c9a84c';
const SEARCH_ICON = '#bfb7a4';
const TAGS = ['all', 'wedding', 'photoshoot', 'event', 'other'] as const;

export default function CarListScreen({ navigation, route }: any) {
  const initialTag = route.params?.tag || 'all';
  const [cars, setCars] = useState<ClassicCar[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<string>(initialTag);
  const { width } = useWindowDimensions();
  const tabBarHeight = useBottomTabBarHeight();

  const load = useCallback(() => {
    setLoading(true);
    carsAPI.getAll({ tag: tag !== 'all' ? tag : undefined, available_only: true }).then(data => {
      setCars(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tag]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (route.params?.tag) setTag(route.params.tag);
  }, [route.params?.tag]);

  const filtered = search
    ? cars.filter(c => `${c.make} ${c.model} ${c.location}`.toLowerCase().includes(search.toLowerCase()))
    : cars;

  const numCols = width >= 600 ? 2 : 1;

  const renderItem = ({ item: car }: { item: ClassicCar }) => {
    const img = car.primary_image_url || (car.images?.[0]?.url);
    const fullImg = getFullImageUrl(img);
    const priceDay = car.price_per_day_cents ? `$${Math.round(car.price_per_day_cents / 100)}/day` : null;
    const priceHr = car.price_per_hour_cents ? `$${Math.round(car.price_per_hour_cents / 100)}/hr` : null;
    const tags = Array.isArray(car.tags) ? car.tags : (typeof car.tags === 'string' ? JSON.parse(car.tags || '[]') : []);

    return (
      <TouchableOpacity
        style={[styles.card, { width: numCols > 1 ? (width - 48) / 2 : width - 32 }]}
        onPress={() => navigation.navigate('CarDetail', { carId: car.id })}
        activeOpacity={0.85}
      >
        {fullImg ? (
          <Image source={{ uri: fullImg }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.imagePlaceholder]}>
            <Ionicons name="car-sport-outline" size={40} color="#8c8576" />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.carTitle}>{car.year} {car.make} {car.model}</Text>
          {car.color ? <Text style={styles.carSub}>{car.color}</Text> : null}
          {car.location ? (
            <Text style={styles.location}>
              <Ionicons name="location-outline" size={12} /> {car.location}
            </Text>
          ) : null}
          <View style={styles.row}>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {tags.slice(0, 2).map((t: string) => (
                <View key={t} style={styles.tagBadge}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
            {(priceDay || priceHr) && (
              <Text style={styles.price}>{priceDay || priceHr}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={SEARCH_ICON} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by make, model, location…"
          placeholderTextColor="#b1a998"
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={SEARCH_ICON} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Tag filters */}
      <FlatList
        horizontal
        data={TAGS}
        keyExtractor={t => t}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagRow}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            style={[styles.tagFilter, tag === t && styles.tagFilterActive]}
            onPress={() => setTag(t)}
          >
            <Text style={[styles.tagFilterText, tag === t && styles.tagFilterTextActive]}>
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
        style={styles.tagRowContainer}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GOLD} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="car-sport-outline" size={48} color="#7a7365" />
          <Text style={styles.emptyText}>No cars found</Text>
          {search ? <Text style={styles.emptyHint}>Try a different search</Text> : null}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          numColumns={numCols}
          key={numCols}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 24 }]}
          columnWrapperStyle={numCols > 1 ? { gap: 16, paddingHorizontal: 16 } : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', margin: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchInput: { flex: 1, color: '#f0ebe0', fontSize: 14 },
  tagRowContainer: { maxHeight: 48 },
  tagRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  tagFilter: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  tagFilterActive: { backgroundColor: GOLD, borderColor: GOLD },
  tagFilterText: { color: '#a09070', fontSize: 13, textTransform: 'capitalize', textAlign: 'center' },
  tagFilterTextActive: { color: '#0d0d0d', fontWeight: '700' },
  list: { padding: 16, paddingTop: 8, gap: 16 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardImage: { width: '100%', aspectRatio: 16 / 10 },
  imagePlaceholder: { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 12 },
  carTitle: { color: '#f0ebe0', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  carSub: { color: '#a09070', fontSize: 12, marginBottom: 4 },
  location: { color: '#a09070', fontSize: 11, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tagBadge: { backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { color: GOLD, fontSize: 10, textTransform: 'capitalize' },
  price: { color: GOLD, fontSize: 13, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#b1a998', fontSize: 16, marginTop: 12 },
  emptyHint: { color: '#8c8576', fontSize: 13, marginTop: 4 },
});
