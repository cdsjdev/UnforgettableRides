import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#c9a84c';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Sign in failed. Please try again.';
      setError(msg);
      if (Platform.OS !== 'web') Alert.alert('Sign In Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={48} color={GOLD} />
          <Text style={styles.brand}>UnforgettableRides</Text>
          <Text style={styles.tagline}>Premium Classic Car Hire</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={v => { setEmail(v); setError(''); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color="#555" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#555"
              value={password}
              onChangeText={v => { setPassword(v); setError(''); }}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#555" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerLabel}>or</Text><View style={styles.dividerLine} /></View>

          <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.outlineBtnText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { alignItems: 'center', marginBottom: 32 },
  brand: { color: GOLD, fontSize: 26, fontWeight: '800', marginTop: 12, letterSpacing: 0.5 },
  tagline: { color: '#a09070', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#f0ebe0', fontSize: 22, fontWeight: '700', marginBottom: 20 },
  error: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13 },
  label: { color: '#a09070', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f0ebe0', fontSize: 15, paddingVertical: 12 },
  btn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
  link: { alignSelf: 'center', marginTop: 14 },
  linkText: { color: GOLD, fontSize: 13 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerLabel: { color: '#555', fontSize: 12, marginHorizontal: 10 },
  outlineBtn: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  outlineBtnText: { color: GOLD, fontWeight: '700', fontSize: 15 },
});
