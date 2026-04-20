import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { messagingAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { SocialMessage } from '../../../shared/types';

const GOLD = '#c9a84c';

function formatMsgTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageThreadScreen({ navigation, route }: any) {
  const { threadId, displayName } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({ title: displayName || 'Message' });
  }, [displayName]);

  const load = useCallback(async () => {
    try {
      const page = await messagingAPI.getMessages(threadId, { limit: 100 });
      const sorted = [...page.items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(sorted);
      setLoading(false);
      if (sorted.length > 0) {
        const last = sorted[sorted.length - 1];
        await messagingAPI.markRead(threadId, last.id).catch(() => {});
      }
    } catch {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [messages]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setBody('');
    setSending(true);
    try {
      const msg = await messagingAPI.sendMessage(threadId, text);
      setMessages(prev => [...prev, msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setBody(text);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={GOLD} /></View>;

  const renderItem = ({ item: msg }: { item: SocialMessage }) => {
    const isMine = msg.senderUserId === user?.id;
    return (
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
          {msg.body}
        </Text>
        <Text style={[styles.bubbleTime, isMine ? { color: 'rgba(13,13,13,0.6)' } : { color: '#9d9586' }]}>
          {formatMsgTime(msg.createdAt)}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      {messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message…"
          placeholderTextColor="#9d9586"
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={1000}
          onSubmitEditing={Platform.OS !== 'web' ? undefined : send}
        />
        <TouchableOpacity style={[styles.sendBtn, (!body.trim() || sending) && styles.sendBtnDisabled]} onPress={send} disabled={!body.trim() || sending}>
          {sending ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Ionicons name="send" size={18} color="#0d0d0d" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#9d9586', fontSize: 14 },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: GOLD, borderBottomRightRadius: 4 },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#1f1f1f', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextMine: { color: '#0d0d0d' },
  bubbleTextTheirs: { color: '#f0ebe0' },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', backgroundColor: '#0d0d0d' },
  input: { flex: 1, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: '#f0ebe0', fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
