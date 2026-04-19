import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

function PulseBlock({ style }: { style?: any }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

export function FeedSkeleton() {
  return (
    <View style={styles.feedWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.feedCard}>
          <View style={styles.feedHeader}>
            <PulseBlock style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <PulseBlock style={styles.lineMd} />
              <PulseBlock style={styles.lineSm} />
            </View>
          </View>
          <PulseBlock style={styles.lineLg} />
          <PulseBlock style={styles.media} />
          <View style={styles.actionsRow}>
            <PulseBlock style={styles.actionDot} />
            <PulseBlock style={styles.actionDot} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={styles.profileWrap}>
      <PulseBlock style={styles.profileAvatar} />
      <PulseBlock style={styles.profileName} />
      <View style={styles.statsShell}>
        <PulseBlock style={styles.statsPill} />
        <PulseBlock style={styles.statsPill} />
      </View>
      <PulseBlock style={styles.btn} />
      <PulseBlock style={styles.btn} />
      <View style={styles.gridWrap}>
        {[0, 1, 2, 3, 4, 5].map((i) => <PulseBlock key={i} style={styles.gridCell} />)}
      </View>
    </View>
  );
}

export function ThreadSkeleton() {
  return (
    <View style={styles.threadWrap}>
      <View style={styles.bubbleRowLeft}><PulseBlock style={styles.bubbleShort} /></View>
      <View style={styles.bubbleRowRight}><PulseBlock style={styles.bubbleLong} /></View>
      <View style={styles.bubbleRowLeft}><PulseBlock style={styles.bubbleLong} /></View>
      <View style={styles.bubbleRowRight}><PulseBlock style={styles.bubbleShort} /></View>
      <View style={styles.sendBar} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: '#E2E8F0', borderRadius: 8 },

  feedWrap: { flex: 1, backgroundColor: '#F9FAFB', paddingTop: 8 },
  feedCard: { backgroundColor: '#fff', marginBottom: 8, padding: 14 },
  feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  lineLg: { height: 14, width: '85%', marginBottom: 10 },
  lineMd: { height: 13, width: '44%', marginBottom: 6 },
  lineSm: { height: 12, width: '30%' },
  media: { height: 170, borderRadius: 12, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 20 },
  actionDot: { width: 44, height: 12, borderRadius: 999 },

  profileWrap: { flex: 1, alignItems: 'center', paddingTop: 24, backgroundColor: '#fff' },
  profileAvatar: { width: 84, height: 84, borderRadius: 42 },
  profileName: { width: 140, height: 18, marginTop: 12, marginBottom: 12 },
  statsShell: { width: '80%', flexDirection: 'row', gap: 10, marginBottom: 14 },
  statsPill: { flex: 1, height: 46, borderRadius: 12 },
  btn: { width: '74%', height: 42, borderRadius: 12, marginBottom: 10 },
  gridWrap: { marginTop: 10, width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCell: { width: '32.8%', aspectRatio: 1, marginBottom: 4, borderRadius: 0 },

  threadWrap: { flex: 1, backgroundColor: '#fff', padding: 14, justifyContent: 'center' },
  bubbleRowLeft: { alignItems: 'flex-start', marginBottom: 10 },
  bubbleRowRight: { alignItems: 'flex-end', marginBottom: 10 },
  bubbleShort: { width: '42%', height: 42, borderRadius: 18 },
  bubbleLong: { width: '63%', height: 50, borderRadius: 18 },
  sendBar: { height: 50, borderRadius: 25, backgroundColor: '#E2E8F0', marginTop: 24 },
});
