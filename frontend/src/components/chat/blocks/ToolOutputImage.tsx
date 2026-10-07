import { useEffect, useState } from 'react';
import { readLocalImage, ToolCallImage } from '../../../utils/toolCallImages';

interface Props {
  image: ToolCallImage;
  onImageClick?: (src: string) => void;
}

export function ToolOutputImage({ image, onImageClick }: Props) {
  const requestKey = 'src' in image ? image.src : image.path;
  const [src, setSrc] = useState('src' in image ? image.src : null);

  useEffect(() => {
    if ('src' in image) {
      setSrc(image.src);
      return;
    }
    let active = true;
    readLocalImage(image.path).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
    // Keyed by source only: the parent re-extracts image objects on every entry update.
  }, [requestKey]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className={`block max-h-[120px] max-w-full w-auto rounded-[6px] border border-border ${onImageClick ? 'cursor-zoom-in' : ''}`}
      onClick={onImageClick ? () => onImageClick(src) : undefined}
    />
  );
}
