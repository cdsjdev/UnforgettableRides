import React from 'react';
import ImageViewing from 'react-native-image-viewing';

type ViewerImage = { uri: string };

type Props = {
  images: ViewerImage[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
};

export default function PinchImageViewer({ images, imageIndex, visible, onRequestClose }: Props) {
  return (
    <ImageViewing
      images={images}
      imageIndex={imageIndex}
      visible={visible}
      onRequestClose={onRequestClose}
      swipeToCloseEnabled
      animationType="fade"
    />
  );
}

