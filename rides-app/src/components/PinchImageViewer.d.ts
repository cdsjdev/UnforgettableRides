import type { ComponentType } from 'react';

type ViewerImage = { uri: string };

type Props = {
  images: ViewerImage[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
};

declare const PinchImageViewer: ComponentType<Props>;
export default PinchImageViewer;

