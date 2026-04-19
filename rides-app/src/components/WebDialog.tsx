import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Tone = 'error' | 'success' | 'warning';
type Mode = 'notice' | 'confirm';

interface WebDialogProps {
  visible: boolean;
  title: string;
  message: string;
  tone?: Tone;
  mode?: Mode;
  primaryLabel: string;
  onPrimaryPress: () => void;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}

export default function WebDialog({
  visible,
  title,
  message,
  tone = 'success',
  mode = 'notice',
  primaryLabel,
  onPrimaryPress,
  secondaryLabel,
  onSecondaryPress,
}: WebDialogProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <View
            style={[
              styles.iconBg,
              tone === 'error' ? styles.iconError : tone === 'warning' ? styles.iconWarning : styles.iconSuccess,
            ]}
          >
            <Ionicons
              name={tone === 'error' ? 'alert-circle-outline' : tone === 'warning' ? 'help-circle-outline' : 'checkmark-circle-outline'}
              size={20}
              color={tone === 'error' ? '#DC2626' : tone === 'warning' ? '#B45309' : '#15803D'}
            />
          </View>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {mode === 'confirm' ? (
          <View style={styles.confirmActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryPress}>
              <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={onPrimaryPress}>
              <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, tone === 'error' ? styles.primaryButtonError : styles.primaryButtonSuccess]}
            onPress={onPrimaryPress}
          >
            <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconError: { backgroundColor: '#FEE2E2' },
  iconSuccess: { backgroundColor: '#DCFCE7' },
  iconWarning: { backgroundColor: '#FEF3C7' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonError: { backgroundColor: '#DC2626' },
  primaryButtonSuccess: { backgroundColor: '#2563EB' },
  dangerButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#DC2626',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
