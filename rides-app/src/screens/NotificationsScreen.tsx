import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const GOLD = '#c9a84c';

export default function NotificationsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.center}>
        <Ionicons name="notifications-outline" size={48} color="#7a7365" />
        <Text style={styles.title}>No notifications yet</Text>
        <Text style={styles.sub}>Booking updates and messages will appear here.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 400 },
  title: { color: '#b1a998', fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  sub: { color: '#8c8576', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
