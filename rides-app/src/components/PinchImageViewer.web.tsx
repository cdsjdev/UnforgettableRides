import React from 'react';
import { Image, Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ViewerImage = { uri: string };

type Props = {
  images: ViewerImage[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
};

export default function PinchImageViewer({ images, imageIndex, visible, onRequestClose }: Props) {
  const uri = images[imageIndex]?.uri;
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onRequestClose}>
      <Pressable style={styles.backdrop} onPress={onRequestClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <TouchableOpacity
            style={styles.close}
            onPress={onRequestClose}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          {!!uri && (
            <Image
              source={{ uri }}
              style={styles.image}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  card: {
    width: '100%' as any,
    maxWidth: 960,
    height: '80%' as any,
    maxHeight: 860,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  close: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 3,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15,23,42,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%' as any,
    height: '100%' as any,
    backgroundColor: '#000',
  },
});

