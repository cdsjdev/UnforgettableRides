import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../services/api';

const GOLD = '#c9a84c';

export default function ResetPasswordScreen({ navigation, route }: any) {
  const tokenFromParams = route?.params?.token || '';
  const [token, setToken] = useState(tokenFromParams);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!token.trim()) { setError('Reset token is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setError('');
    setLoading(true);
    try {
      await authAPI.resetPassword(token.trim(), password);
      setDone(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Failed to reset password.';
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
          <Ionicons name="lock-closed-outline" size={40} color={GOLD} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.title}>Set New Password</Text>

          {done ? (
            <>
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle-outline" size={24} color="#10b981" />
                <Text style={styles.successText}>Password reset! You can now sign in.</Text>
              </View>
              <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.btnText}>Sign In</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}

              {!tokenFromParams && (
                <>
                  <Text style={styles.label}>Reset Token</Text>
                  <View style={styles.inputRow}>
                    <TextInput style={styles.input} placeholder="Paste token from email" placeholderTextColor="#9d9586" value={token} onChangeText={v => { setToken(v); setError(''); }} autoCapitalize="none" editable={!loading} />
                  </View>
                </>
              )}

              <Text style={styles.label}>New Password</Text>
              <View style={styles.inputRow}>
                <TextInput style={styles.input} placeholder="Min 6 characters" placeholderTextColor="#9d9586" value={password} onChangeText={v => { setPassword(v); setError(''); }} secureTextEntry editable={!loading} />
              </View>

              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputRow}>
                <TextInput style={styles.input} placeholder="Repeat password" placeholderTextColor="#9d9586" value={confirm} onChangeText={v => { setConfirm(v); setError(''); }} secureTextEntry editable={!loading} />
              </View>

              <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Text style={styles.btnText}>Reset Password</Text>}
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
  title: { color: '#f0ebe0', fontSize: 22, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  error: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: 14, marginBottom: 16 },
  successText: { color: '#10b981', fontSize: 14, flex: 1 },
  label: { color: '#a09070', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  inputRow: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, marginBottom: 16 },
  input: { color: '#f0ebe0', fontSize: 15, paddingVertical: 12 },
  btn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20 },
  backLinkText: { color: GOLD, fontSize: 13 },
});
