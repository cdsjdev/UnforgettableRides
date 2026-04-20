import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#c9a84c';

const ROLES = [
  { value: 'customer', label: 'Customer', sub: 'Browse & book classic cars' },
  { value: 'owner', label: 'Car Owner', sub: 'List your classic cars for hire' },
];

export default function RegisterScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const initialRole = route?.params?.role || 'customer';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<string>(initialRole);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, role);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Registration failed.';
      setError(msg);
      if (Platform.OS !== 'web') Alert.alert('Registration Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(36, insets.top + 18),
            paddingBottom: Math.max(32, insets.bottom + 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Ionicons name="car-sport" size={48} color={GOLD} />
          <Text style={styles.brand}>UnforgettableRides</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Get Started</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>I want to</Text>
          <View style={styles.roleRow}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[styles.roleBtn, role === r.value && styles.roleBtnActive]}
                onPress={() => setRole(r.value)}
              >
                <Text style={[styles.roleBtnTitle, role === r.value && styles.roleBtnTitleActive]}>{r.label}</Text>
                <Text style={[styles.roleBtnSub, role === r.value && styles.roleBtnSubActive]}>{r.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color="#9d9586" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor="#9d9586" value={name} onChangeText={v => { setName(v); setError(''); }} editable={!loading} />
          </View>

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color="#9d9586" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor="#9d9586" value={email} onChangeText={v => { setEmail(v); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!loading} />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color="#9d9586" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Min 6 characters" placeholderTextColor="#9d9586" value={password} onChangeText={v => { setPassword(v); setError(''); }} secureTextEntry={!showPassword} editable={!loading} />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9d9586" />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color="#9d9586" style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Repeat password" placeholderTextColor="#9d9586" value={confirmPassword} onChangeText={v => { setConfirmPassword(v); setError(''); }} secureTextEntry={!showPassword} editable={!loading} />
          </View>

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerLabel}>or</Text><View style={styles.dividerLine} /></View>

          <TouchableOpacity style={styles.outlineBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.outlineBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logo: { alignItems: 'center', marginBottom: 32 },
  brand: { color: GOLD, fontSize: 26, fontWeight: '800', marginTop: 12, letterSpacing: 0.5 },
  tagline: { color: '#a09070', fontSize: 13, marginTop: 4 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#f0ebe0', fontSize: 22, fontWeight: '700', marginBottom: 20 },
  error: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 13 },
  label: { color: '#a09070', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleBtn: { flex: 1, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 12 },
  roleBtnActive: { borderColor: GOLD, backgroundColor: 'rgba(201,168,76,0.1)' },
  roleBtnTitle: { color: '#a09070', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  roleBtnTitleActive: { color: GOLD },
  roleBtnSub: { color: '#9d9586', fontSize: 11 },
  roleBtnSubActive: { color: '#a09070' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, marginBottom: 16 },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, color: '#f0ebe0', fontSize: 15, paddingVertical: 12 },
  btn: { backgroundColor: GOLD, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  dividerLabel: { color: '#9d9586', fontSize: 12, marginHorizontal: 10 },
  outlineBtn: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  outlineBtnText: { color: GOLD, fontWeight: '700', fontSize: 15 },
});
