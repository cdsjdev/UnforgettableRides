import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useWebLayout } from '../utils/webStyles';
import { healthCheck } from '../services/api';
import { APP_BUILD_DATE, APP_BUILD_SHA, APP_DISPLAY_VERSION } from '../version';

type SectionProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

function Section({ title, icon, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setOpen((v) => !v)} activeOpacity={0.75}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name={icon} size={18} color="#3B82F6" />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
      </TouchableOpacity>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>-</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export default function HelpScreen() {
  const { containerStyle } = useWebLayout('content');
  const [apiVersion, setApiVersion] = useState('unknown');
  const [serverBuildDate, setServerBuildDate] = useState('unknown');
  const [serverBuildSha, setServerBuildSha] = useState('unknown');

  useEffect(() => {
    let mounted = true;
    healthCheck()
      .then((data) => {
        if (!mounted) return;
        setApiVersion(data?.version || 'unknown');
        setServerBuildDate(data?.build?.date || 'unknown');
        const commit = data?.build?.commit || 'unknown';
        setServerBuildSha(commit === 'unknown' ? commit : commit.slice(0, 7));
      })
      .catch(() => {
        if (!mounted) return;
        setApiVersion('unknown');
        setServerBuildDate('unknown');
        setServerBuildSha('unknown');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const buildDate = serverBuildDate !== 'unknown' ? serverBuildDate : APP_BUILD_DATE;
  const buildSha = serverBuildSha !== 'unknown' ? serverBuildSha : APP_BUILD_SHA;

  return (
    <ScrollView style={styles.container} contentContainerStyle={containerStyle}>
      <View style={styles.header}>
        <Ionicons name="help-circle" size={44} color="#3B82F6" />
        <Text style={styles.title}>Help & Guide</Text>
        <Text style={styles.subtitle}>English-only quick reference for booking, messaging, and account flows.</Text>
      </View>

      <Section title="Getting Started" icon="rocket" defaultOpen>
        <Bullet text="Browse featured listings on Home or explore all listings in Cars." />
        <Bullet text="Open any listing to review photos, pricing, and owner details." />
        <Bullet text="Tap Book to submit a request with date, duration, and pickup notes." />
      </Section>

      <Section title="Bookings" icon="calendar">
        <Bullet text="Customers can create booking requests and track status in My Bookings." />
        <Bullet text="Owners can review and manage incoming requests from owner tools." />
        <Bullet text="If a booking date is unavailable, choose another date and resubmit." />
      </Section>

      <Section title="Messaging" icon="chatbubbles">
        <Bullet text="Start a direct message from a listing page by tapping Message Owner." />
        <Bullet text="Unread indicators appear on the Messages tab and clear after reading." />
        <Bullet text="If messaging fails, check your network and retry from the thread page." />
      </Section>

      <Section title="Account & Security" icon="shield-checkmark">
        <Bullet text="Sign in with your account email and password." />
        <Bullet text="Use Forgot Password on the login screen to request a reset link." />
        <Bullet text="Keep your contact details up to date for booking and message notifications." />
      </Section>

      <Section title="Support" icon="mail">
        <Bullet text="Need help with a booking or listing? Email support@unforgettablerides.com." />
        <Bullet text="For urgent booking changes, contact the owner directly in your thread." />
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Version: App v{APP_DISPLAY_VERSION} · API v{apiVersion}</Text>
        <Text style={styles.footerText}>Build: {buildDate} ({buildSha})</Text>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:support@unforgettablerides.com')}>
          <Text style={styles.supportLink}>Contact Support</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  title: { marginTop: 10, fontSize: 24, fontWeight: '800', color: '#1e293b' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20, color: '#64748b', textAlign: 'center' },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#f8fafc',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  sectionBody: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bulletDot: { color: '#3b82f6', marginRight: 8, fontWeight: '700' },
  bulletText: { flex: 1, color: '#334155', lineHeight: 21, fontSize: 14 },
  footer: { padding: 18, alignItems: 'center', gap: 6 },
  footerText: { color: '#64748b', fontSize: 12 },
  supportLink: { marginTop: 4, color: '#2563eb', fontWeight: '700', fontSize: 13 },
});
