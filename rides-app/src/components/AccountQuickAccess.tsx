import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { getFullImageUrl } from '../services/api';
import type { RootTabParamList } from '../navigation/AppNavigator';

const GOLD = '#c9a84c';

interface AccountQuickAccessProps {
  compact?: boolean;
}

export default function AccountQuickAccess({ compact = false }: AccountQuickAccessProps) {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { user } = useAuth();

  const openAccount = () => {
    navigation.navigate('Profile', { screen: user ? 'ProfileMain' : 'Login' });
  };

  if (user) {
    const avatarUrl = getFullImageUrl(user.avatar_url);
    return (
      <TouchableOpacity style={[styles.avatarBtn, compact && styles.avatarBtnCompact]} onPress={openAccount} activeOpacity={0.8}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarFallbackText}>{String(user.name || 'U').charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.signInBtn, compact && styles.signInBtnCompact]}
      onPress={openAccount}
      activeOpacity={0.85}
    >
      <Ionicons name="person-circle-outline" size={compact ? 15 : 16} color={GOLD} />
      {!compact ? <Text style={styles.signInText}>Sign In</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.55)',
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  avatarBtnCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,168,76,0.2)',
  },
  avatarFallbackText: { color: GOLD, fontSize: 14, fontWeight: '700' },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.45)',
    backgroundColor: 'rgba(13,13,13,0.85)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  signInBtnCompact: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  signInText: { color: GOLD, fontSize: 12, fontWeight: '700' },
});
