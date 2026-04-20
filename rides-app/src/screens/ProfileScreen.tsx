import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const GOLD = '#c9a84c';

function MenuItem({ icon, label, sub, onPress, danger }: { icon: string; label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={22} color={danger ? '#ef4444' : GOLD} style={styles.menuIcon} />
      <View style={styles.menuLabel}>
        <Text style={[styles.menuText, danger && { color: '#ef4444' }]}>{label}</Text>
        {sub ? <Text style={styles.menuSub}>{sub}</Text> : null}
      </View>
      {!danger ? <Ionicons name="chevron-forward" size={16} color="#444" /> : null}
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [enablingOwner, setEnablingOwner] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleChangePassword = async () => {
    if (newPw.length < 6) { Alert.alert('Password must be at least 6 characters'); return; }
    setSavingPw(true);
    try {
      await authAPI.changePassword(currentPw, newPw);
      setChangingPw(false);
      setCurrentPw(''); setNewPw('');
      Alert.alert('Password updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error?.message || e.message || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  const handleEnableOwner = async () => {
    setEnablingOwner(true);
    try {
      await authAPI.becomeOwner();
      await refreshUser();
      Alert.alert('Owner access enabled', 'You can now list cars while still booking as a customer.');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error?.message || e.message || 'Failed to enable owner access');
    } finally {
      setEnablingOwner(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.guestContainer, { paddingTop: Math.max(32, insets.top + 16) }]}>
        <Ionicons name="person-circle-outline" size={72} color="#333" />
        <Text style={styles.guestTitle}>Welcome to UnforgettableRides</Text>
        <Text style={styles.guestSub}>Sign in to manage bookings and messages</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.signInBtnText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.registerBtn} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.registerBtnText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ownerLink} onPress={() => navigation.navigate('Register', { role: 'owner' })}>
          <Text style={styles.ownerLinkText}>List your classic car {'->'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = user.role === 'owner' || user.role === 'admin';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.header, { paddingTop: Math.max(32, insets.top + 16) }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{user.role}</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>My Activity</Text>
      <View style={styles.menuGroup}>
        <MenuItem icon="calendar-outline" label="My Bookings" sub="View booking requests" onPress={() => navigation.navigate('BookingsList')} />
        {isOwner ? <MenuItem icon="car-outline" label="My Listings" sub="Manage your classic cars" onPress={() => navigation.navigate('MyListings')} /> : null}
      </View>

      {!isOwner ? (
        <>
          <Text style={styles.sectionHeader}>Role Access</Text>
          <View style={styles.menuGroup}>
            <MenuItem
              icon="car-sport-outline"
              label={enablingOwner ? 'Enabling Owner Access...' : 'Enable Owner Access'}
              sub="Use the same account for both booking and listing cars"
              onPress={handleEnableOwner}
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.menuGroup}>
        <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => setChangingPw(v => !v)} />
        <MenuItem icon="help-circle-outline" label="Help" onPress={() => navigation.navigate('Help')} />
        <MenuItem icon="chatbox-outline" label="Send Feedback" onPress={() => navigation.navigate('Feedback')} />
      </View>

      {changingPw ? (
        <View style={styles.pwForm}>
          <Text style={styles.pwTitle}>Change Password</Text>
          <TextInput style={styles.pwInput} placeholder="Current password" placeholderTextColor="#555" secureTextEntry value={currentPw} onChangeText={setCurrentPw} />
          <TextInput style={styles.pwInput} placeholder="New password (min 6 chars)" placeholderTextColor="#555" secureTextEntry value={newPw} onChangeText={setNewPw} />
          <View style={styles.pwActions}>
            <TouchableOpacity style={styles.pwSaveBtn} onPress={handleChangePassword} disabled={savingPw}>
              {savingPw ? <ActivityIndicator color="#0d0d0d" size="small" /> : <Text style={styles.pwSaveBtnText}>Update Password</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setChangingPw(false); setCurrentPw(''); setNewPw(''); }}>
              <Text style={styles.pwCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={[styles.menuGroup, { marginTop: 12 }]}>
        <MenuItem icon="log-out-outline" label="Sign Out" onPress={handleLogout} danger />
      </View>

      <Text style={styles.footer}>UnforgettableRides - Premium Classic Car Hire</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { paddingBottom: 40 },
  guestContainer: { flex: 1, backgroundColor: '#0d0d0d', alignItems: 'center', justifyContent: 'center', padding: 32 },
  guestTitle: { color: '#f0ebe0', fontSize: 22, fontWeight: '700', marginTop: 20, marginBottom: 8, textAlign: 'center' },
  guestSub: { color: '#a09070', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  signInBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 40, paddingVertical: 14, width: '100%', alignItems: 'center', marginBottom: 12 },
  signInBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 16 },
  registerBtn: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 10, paddingHorizontal: 40, paddingVertical: 14, width: '100%', alignItems: 'center' },
  registerBtnText: { color: GOLD, fontWeight: '700', fontSize: 16 },
  ownerLink: { marginTop: 20 },
  ownerLinkText: { color: '#a09070', fontSize: 14 },
  header: { alignItems: 'center', padding: 32, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: GOLD, marginBottom: 12 },
  avatarText: { color: GOLD, fontSize: 30, fontWeight: '700' },
  name: { color: '#f0ebe0', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  email: { color: '#a09070', fontSize: 14, marginBottom: 10 },
  roleBadge: { backgroundColor: 'rgba(201,168,76,0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  roleText: { color: GOLD, fontSize: 12, textTransform: 'capitalize', fontWeight: '600' },
  sectionHeader: { color: '#a09070', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  menuGroup: { backgroundColor: '#1a1a1a', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  menuIcon: { width: 30 },
  menuLabel: { flex: 1 },
  menuText: { color: '#f0ebe0', fontSize: 15 },
  menuSub: { color: '#555', fontSize: 12, marginTop: 2 },
  pwForm: { margin: 16, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pwTitle: { color: '#f0ebe0', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  pwInput: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 14, color: '#f0ebe0', fontSize: 14, marginBottom: 12 },
  pwActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pwSaveBtn: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  pwSaveBtnText: { color: '#0d0d0d', fontWeight: '700', fontSize: 14 },
  pwCancelText: { color: '#a09070', fontSize: 14 },
  footer: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 32 },
});

