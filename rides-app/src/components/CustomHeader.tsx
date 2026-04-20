import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const logoImage = require('../../assets/logo.png');

interface CustomHeaderProps {
  navigation: any;
  subtitle?: string;
  extraRight?: React.ReactNode;
  showBackOverride?: boolean;
}

export default function CustomHeader({ navigation, subtitle, extraRight, showBackOverride }: CustomHeaderProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const canGoBackHere = Boolean(navigation?.canGoBack?.());
  const showBack = Platform.OS !== 'web' && (typeof showBackOverride === 'boolean' ? showBackOverride : canGoBackHere);

  const navItems = [
    { screen: 'Help',       icon: 'help-circle-outline' as const, color: '#3B82F6', label: 'Help' },
    { screen: 'Profile',    icon: 'person-circle-outline' as const, color: '#3B82F6', label: 'Profile' },
    { screen: 'Feedback',   icon: 'chatbox-ellipses-outline' as const, color: '#3B82F6', label: 'Feedback' },
  ];

  const handleNav = (screen: string) => {
    setMenuOpen(false);
    navigation.navigate('Home', { screen });
  };

  const handleBack = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.left}>
          {showBack ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </TouchableOpacity>
          ) : null}
          <Image source={logoImage} style={styles.brandLogo} />
          <View>
            <Text style={styles.brandText}>UnforgettableRides</Text>
            {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.right}>
          {extraRight}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#6B7280" />
          </TouchableOpacity>
          <Modal transparent visible={menuOpen} animationType="fade" onRequestClose={() => setMenuOpen(false)}>
            <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
              <View style={[styles.dropdown, { top: insets.top + 56 }]}>
                {navItems.map(item => (
                  <TouchableOpacity key={item.screen} style={styles.dropdownItem} onPress={() => handleNav(item.screen)}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                    <Text style={styles.dropdownLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  brandLogo: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  subtitleText: {
    fontSize: 12,
    color: '#6B7280',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdown: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownLabel: {
    fontSize: 15,
    color: '#111827',
  },
});
