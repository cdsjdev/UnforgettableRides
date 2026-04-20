import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { feedbackAPI } from '../services/api';
import { useWebLayout } from '../utils/webStyles';
import type { FeedbackItem } from '../../../shared/types';

type FeedbackCategory = FeedbackItem['category'];

const CATEGORY_OPTIONS: FeedbackCategory[] = ['general', 'bug', 'improvement', 'feature', 'other'];

export default function FeedbackScreen() {
  const { containerStyle } = useWebLayout('content');
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [successText, setSuccessText] = useState('');
  const maxLen = 2000;

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      const msg = 'Please enter your feedback message.';
      setErrorText(msg);
      if (Platform.OS !== 'web') Alert.alert('Error', msg);
      return;
    }
    if (trimmed.length > maxLen) {
      const msg = `Message cannot exceed ${maxLen} characters.`;
      setErrorText(msg);
      if (Platform.OS !== 'web') Alert.alert('Error', msg);
      return;
    }

    setSubmitting(true);
    setErrorText('');
    try {
      await feedbackAPI.submit(trimmed, category);
      setMessage('');
      setCategory('general');
      setErrorText('');
      setSuccessText('Thanks for your feedback.');
      if (Platform.OS !== 'web') {
        Alert.alert('Success', 'Thanks for your feedback.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Unable to submit feedback right now.';
      setSuccessText('');
      setErrorText(msg);
      if (Platform.OS !== 'web') Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, containerStyle]} keyboardShouldPersistTaps="handled">
      <View style={styles.headerCard}>
        <Ionicons name="chatbubbles-outline" size={30} color="#3B82F6" />
        <Text style={styles.title}>Feedback</Text>
        <Text style={styles.subtitle}>Tell us what is working and what we should improve.</Text>
      </View>

      <View style={styles.card}>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        {successText ? <Text style={styles.successText}>{successText}</Text> : null}

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipsRow}>
          {CATEGORY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, category === opt && styles.chipActive]}
              onPress={() => setCategory(opt)}
              disabled={submitting}
            >
              <Text style={[styles.chipText, category === opt && styles.chipTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={styles.textArea}
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your issue or suggestion"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={6}
          editable={!submitting}
          maxLength={maxLen}
        />
        <Text style={styles.countText}>{message.length}/{maxLen}</Text>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  chipText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#1D4ED8',
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#1E293B',
  },
  countText: {
    marginTop: 6,
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'right',
  },
  submitBtn: {
    marginTop: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignSelf: 'center',
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  successText: {
    fontSize: 13,
    color: '#166534',
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
});
