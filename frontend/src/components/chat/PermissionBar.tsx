import { memo } from 'react';
import { ShieldAlert } from 'lucide-react';
import { PermissionRequest } from '../../types/chat';
import { Button } from '../ui/Button';
import { Tooltip } from './shared/Tooltip';

interface PermissionBarProps {
  request: PermissionRequest;
  onRespond: (decision: string) => void;
}

const PermissionBar = memo(({ request, onRespond }: PermissionBarProps) => {
  return (
    <div className="w-full py-1">
      <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
        <ShieldAlert size={18} className="shrink-0 text-warning" />
        <Tooltip content={request.title} variant="minimal" className="min-w-[5.35em] flex-1 !max-w-max">
          <span className="block truncate text-foreground text-ide-small">
            {request.title}
          </span>
        </Tooltip>
        {request.options.map((opt, idx) => (
          <Tooltip key={opt.optionId} content={opt.label} className="min-w-[5.35em] flex-1 !max-w-max">
            <Button
              type="button"
              onClick={() => onRespond(opt.optionId)}
              variant={idx === 0 ? 'primary' : 'secondary'}
              className="text-ide-small w-full truncate !inline-block"
            >
              {opt.label}
            </Button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
});

export default PermissionBar;
