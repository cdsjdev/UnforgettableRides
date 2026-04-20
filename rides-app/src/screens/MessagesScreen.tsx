import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { messagingAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { SocialThread } from '../../../shared/types';

const GOLD = '#c9a84c';

function formatTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MessagesScreen({ navigation }: any) {
  const { user } = useAuth();
  const [threads, setThreads] = useState<SocialThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await messagingAPI.getThreads({ limit: 50 });
      setThreads(page.items);
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
        <Ionicons name="chatbubbles-outline" size={48} color="#7a7365" />
        <Text style={styles.emptyTitle}>Sign in to view messages</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => navigation.navigate('Profile', { screen: 'Login' })}>
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;

  const renderItem = ({ item: thread }: { item: SocialThread }) => {
    const displayName = thread.otherUser?.displayName || 'Owner';
    const unread = thread.unreadCount ?? 0;

    return (
      <TouchableOpacity
        style={styles.threadItem}
        onPress={() => navigation.navigate('MessageThread', { threadId: thread.id, displayName })}
        activeOpacity={0.75}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.threadBody}>
          <View style={styles.threadHeader}>
            <Text style={[styles.threadName, unread > 0 && styles.threadNameUnread]}>{displayName}</Text>
            <Text style={styles.threadTime}>{formatTime(thread.lastMessageAt ?? undefined)}</Text>
          </View>
          <View style={styles.threadFooter}>
            <Text style={[styles.threadPreview, unread > 0 && styles.threadPreviewUnread]} numberOfLines={1}>
              {thread.lastMessagePreview || 'Tap to open conversation'}
            </Text>
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {threads.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="chatbubbles-outline" size={48} color="#7a7365" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>When you message a car owner, it will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={t => t.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GOLD} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  threadItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  avatarText: { color: GOLD, fontSize: 18, fontWeight: '700' },
  threadBody: { flex: 1 },
  threadHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  threadName: { color: '#a09070', fontSize: 15, fontWeight: '500' },
  threadNameUnread: { color: '#f0ebe0', fontWeight: '700' },
  threadTime: { color: '#9d9586', fontSize: 12 },
  threadFooter: { flexDirection: 'row', alignItems: 'center' },
  threadPreview: { color: '#9d9586', fontSize: 13, flex: 1 },
  threadPreviewUnread: { color: '#a09070' },
  unreadBadge: { backgroundColor: GOLD, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadText: { color: '#0d0d0d', fontSize: 11, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 78 },
  emptyTitle: { color: '#b1a998', fontSize: 16, marginTop: 12, marginBottom: 6 },
  emptySub: { color: '#8c8576', fontSize: 13, textAlign: 'center' },
  signInBtn: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 28, paddingVertical: 12, marginTop: 12 },
  signInBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
});
