import React from 'react';
import { RichContentBlock } from '../../../types/chat';
import { SubAgentBlock } from './SubAgentBlock';
import { PlanBlockComponent } from './PlanBlock';
import { MarkdownMessage } from '../MarkdownMessage';

interface Props {
  block: RichContentBlock;
  onImageClick?: (src: string) => void;
}

export const ContentBlockRenderer: React.FC<Props> = ({ block, onImageClick }) => {
  switch (block.type) {
    case 'text':
      return <MarkdownMessage content={block.text} enableCodeCopy />;
    case 'tool_call':
      return <SubAgentBlock block={block} />;
    case 'plan':
      return <PlanBlockComponent block={block} />;
    case 'image': {
      const src = block.data.startsWith('data:') ? block.data : `data:${block.mimeType};base64,${block.data}`;
      return (
        <div className="w-fit max-w-full mx-auto rounded-lg overflow-hidden">
          <img
            src={src}
            alt="AI Attachment"
            className={`block max-w-full h-auto ${onImageClick ? 'cursor-zoom-in' : ''}`}
            onClick={onImageClick ? () => onImageClick(src) : undefined}
          />
        </div>
      );
    }
    case 'audio':
      return (
        <div className="rounded-lg overflow-hidden max-w-md">
          <audio controls
            src={block.data.startsWith('data:') ? block.data : `data:${block.mimeType};base64,${block.data}`}
            className="w-full"
          />
        </div>
      );
    case 'video':
      return (
        <div className="rounded-lg overflow-hidden max-w-md">
          <video controls
            src={block.data.startsWith('data:') ? block.data : `data:${block.mimeType};base64,${block.data}`}
            className="w-full h-auto"
          />
        </div>
      );
    default:
      return null;
  }
};
