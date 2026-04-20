import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../services/api';

const GOLD = '#c9a84c';

export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Please enter your email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword(normalized);
      setSent(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to send reset email.';
      setError(msg);
      if (Platform.OS !== 'web') Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Ionicons name="lock-open-outline" size={40} color={GOLD} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.sub}>Enter your email and we'll send you a reset link.</Text>

          {sent ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#10b981" />
              <Text style={styles.successText}>Reset link sent! Check your inbox.</Text>
            </View>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={18} color="#9d9586" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#9d9586"
                  value={email}
                  onChangeText={v => { setEmail(v); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>
              <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Text style={styles.btnText}>Send Reset Link</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('Login')}>
            <Ionicons name="arrow-back" size={14} color={GOLD} />
            <Text style={styles.backLinkText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#f0ebe0', fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  sub: { color: '#a09070', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  error: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 14, marginBottom: 16 },
  successText: { color: '#10b981', fontSize: 14, flex: 1 },
  label: { color: '#a09070', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f0ebe0', fontSize: 15, paddingVertical: 12 },
  btn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  backLinkText: { color: GOLD, fontSize: 13 },
});
