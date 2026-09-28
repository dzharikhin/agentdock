import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Pencil, PlugZap, Plus, Trash2 } from 'lucide-react';
import { CustomAcpConfig, CustomAcpStatusUpdate } from '../types/customAcp';
import { AgentOption } from '../types/chat';
import { ACPBridge } from '../utils/bridge';
import ConfirmationModal from './ConfirmationModal';
import { Tooltip } from './chat/shared/Tooltip';
import { Button } from './ui/Button';
import { Checkbox } from './ui/Checkbox';
import { FormDialog } from './ui/FormDialog';
import { SectionTitle } from './ui/SectionTitle';

interface FormState {
  name: string;
  command: string;
  args: string;
  env: string;
  cliCommand: string;
  cliArgs: string;
  cliResumeArg: string;
}

const emptyForm = (): FormState => ({
  name: '', command: '', args: '', env: '', cliCommand: '', cliArgs: '', cliResumeArg: '',
});

function parseLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function parseEnvironment(value: string) {
  return parseLines(value).flatMap(line => {
    const separator = line.indexOf('=');
    if (separator <= 0) return [];
    return [{ name: line.slice(0, separator).trim(), value: line.slice(separator + 1) }];
  });
}

function configToForm(config: CustomAcpConfig): FormState {
  return {
    name: config.name,
    command: config.command,
    args: config.args.join('\n'),
    env: config.env.map(variable => `${variable.name}=${variable.value}`).join('\n'),
    cliCommand: config.cliCommand ?? '',
    cliArgs: config.cliArgs.join('\n'),
    cliResumeArg: config.cliResumeArgs.find(argument => argument !== '{sessionId}') ?? '',
  };
}

function formToConfig(form: FormState, id: string): CustomAcpConfig {
  const cliResumeArg = form.cliResumeArg.trim();
  return {
    id,
    enabled: true,
    name: form.name.trim(),
    command: form.command.trim(),
    args: parseLines(form.args),
    env: parseEnvironment(form.env),
    cliCommand: form.cliCommand.trim() || undefined,
    cliArgs: parseLines(form.cliArgs),
    cliResumeArgs: cliResumeArg ? [cliResumeArg, '{sessionId}'] : [],
  };
}

function nextId(): string {
  return `custom-acp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CustomAcpView() {
  const [configs, setConfigs] = useState<CustomAcpConfig[]>([]);
  const configsRef = useRef<CustomAcpConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, CustomAcpStatusUpdate>>({});
  const [availableAgents, setAvailableAgents] = useState<AgentOption[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomAcpConfig | null>(null);

  const updateConfigs = (next: CustomAcpConfig[]) => {
    const previous = configsRef.current;
    const unchanged = new Set(next.filter(config =>
      JSON.stringify(previous.find(item => item.id === config.id)) === JSON.stringify(config)
    ).map(config => config.id));
    setStatuses(current => Object.fromEntries(Object.entries(current).filter(([id]) => unchanged.has(id))));
    configsRef.current = next;
    setConfigs(next);
  };

  useEffect(() => {
    const cleanup = ACPBridge.onCustomAcpConfigs(event => {
      updateConfigs(Array.isArray(event.detail.configs) ? event.detail.configs : []);
    });
    const cleanupStatus = ACPBridge.onCustomAcpStatus(event => {
      const update = event.detail.update;
      setStatuses(current => current[update.id]?.requestId === update.requestId
        ? { ...current, [update.id]: update }
        : current);
    });
    const cleanupAdapters = ACPBridge.onAdapters(event => setAvailableAgents(event.detail.adapters));
    ACPBridge.loadCustomAcpConfigs();
    ACPBridge.requestAdapters();
    return () => { cleanup(); cleanupStatus(); cleanupAdapters(); };
  }, []);

  const save = (next: CustomAcpConfig[]) => {
    updateConfigs(next);
    ACPBridge.saveCustomAcpConfigs(next);
  };

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
  };

  const submitForm = () => {
    if (!form?.name.trim() || !form.command.trim()) return;
    if (editingId) {
      save(configs.map(config => config.id === editingId ? { ...formToConfig(form, editingId), enabled: config.enabled } : config));
    } else {
      save([...configs, formToConfig(form, nextId())]);
    }
    closeForm();
  };

  return (
    <div className="h-full overflow-hidden bg-background text-foreground text-ide-small">
      <div className="h-full w-full overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-app-content flex-col">
          <SectionTitle actions={(
            <Button
              onClick={() => { setEditingId(null); setForm(emptyForm()); }}
              variant="primary"
              leftIcon={<Plus size={14} />}
              className="max-h-8"
            >
              Add
            </Button>
          )}>
            Custom ACP agents
          </SectionTitle>

          {configs.length === 0 && !form ? (
            <div className="mt-12 flex flex-1 flex-col items-center gap-2 text-foreground-secondary">
              <Bot size={28} strokeWidth={1.5} />
              <span>No custom ACP agents configured</span>
              <p className="max-w-[520px] text-center">
                Add a custom ACP configuration to use it as a service provider. Some plugin features may be unavailable if the ACP adapter does not support the corresponding ACP methods.
              </p>
            </div>
          ) : null}

          {configs.map(config => {
            const test = statuses[config.id];
            const adapter = config.enabled ? availableAgents.find(agent => agent.id === config.id) : undefined;
            const status = test?.status ?? (adapter?.initializing ? 'loading'
              : adapter?.initializationError ? 'error' : adapter?.ready ? 'connected' : undefined);
            const label = status === 'loading' ? (test ? 'Checking…' : 'Initializing…')
              : status === 'connected' ? (test ? 'Reachable' : 'Ready') : status === 'error' ? 'Error' : undefined;
            const message = test ? test.message : adapter?.initializationError;
            return (
            <div key={config.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <Checkbox
                checked={config.enabled}
                onCheckedChange={() => save(configs.map(item => item.id === config.id ? { ...item, enabled: !item.enabled } : item))}
                aria-label={`${config.enabled ? 'Disable' : 'Enable'} ${config.name}`}
                className="mt-[11px]"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">{config.name}</div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground-secondary">
                  {label && <span
                    role="img"
                    aria-label={label}
                    className={`inline-block h-2 w-2 mt-[-2px] shrink-0 rounded-full ${status === 'loading' ? 'bg-warning animate-pulse' : status === 'error' ? 'bg-error' : 'bg-success'}`}
                  />}
                  <span className="truncate">{config.command}{label ? ` · ${label}` : ''}</span>
                </div>
                {message && <div className={`mt-1 max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words text-xs ${status === 'error' ? 'text-error' : 'text-foreground-secondary'}`}>
                  {message}
                </div>}
              </div>
              <div className="mt-[8px] flex shrink-0 items-center gap-2">
                <Tooltip variant="minimal" content="Test connection">
                  <button
                    type="button"
                    disabled={test?.status === 'loading'}
                    onClick={() => {
                      const requestId = crypto.randomUUID();
                      setStatuses(current => ({ ...current, [config.id]: { id: config.id, requestId, status: 'loading' } }));
                      ACPBridge.testCustomAcpConnection(config.id, requestId);
                    }}
                    className="rounded p-1 text-foreground-secondary transition-colors hover:text-foreground disabled:opacity-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-border"
                    aria-label={`Test connection for ${config.name}`}
                  >
                    {test?.status === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                  </button>
                </Tooltip>
                <Tooltip variant="minimal" content="Edit">
                  <button
                    type="button"
                    onClick={() => { setEditingId(config.id); setForm(configToForm(config)); }}
                    className="rounded p-1 text-foreground-secondary transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-border"
                    aria-label={`Edit ${config.name}`}
                  >
                    <Pencil size={13} />
                  </button>
                </Tooltip>
                <Tooltip variant="minimal" content="Delete">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(config)}
                    className="rounded p-1 text-foreground-secondary transition-colors hover:text-error focus-visible:outline focus-visible:outline-1 focus-visible:outline-border"
                    aria-label={`Delete ${config.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <FormDialog
        isOpen={form !== null}
        title={editingId ? 'Edit Custom ACP agent configuration' : 'New Custom ACP agent configuration'}
        onClose={closeForm}
        footer={(
          <>
            <Button onClick={submitForm} disabled={!form?.name.trim() || !form?.command.trim()} variant="primary">
              Save
            </Button>
            <Button onClick={closeForm} variant="secondary">Cancel</Button>
          </>
        )}
      >
        {form ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
              <span className="text-foreground-secondary">Name <span className="text-error" aria-hidden="true">*</span></span>
              <input
                data-autofocus="true"
                value={form.name}
                onChange={event => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. OpenCode"
                required
                aria-required="true"
              />
            </div>
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
              <span className="text-foreground-secondary">Executable <span className="text-error" aria-hidden="true">*</span></span>
              <input
                value={form.command}
                onChange={event => setForm({ ...form, command: event.target.value })}
                placeholder="e.g. opencode"
                required
                aria-required="true"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-foreground-secondary">Arguments</span>
              <textarea
                value={form.args}
                onChange={event => setForm({ ...form, args: event.target.value })}
                placeholder={'One argument per line, e.g.:\nacp'}
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-foreground-secondary">Environment</span>
              <textarea
                value={form.env}
                onChange={event => setForm({ ...form, env: event.target.value })}
                placeholder={'One KEY=value per line, e.g.:\nAPI_KEY=your-key'}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
              <span className="text-foreground-secondary">CLI executable</span>
              <input
                value={form.cliCommand}
                onChange={event => setForm({ ...form, cliCommand: event.target.value })}
                placeholder="e.g. opencode"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-foreground-secondary">CLI arguments</span>
              <textarea
                value={form.cliArgs}
                onChange={event => setForm({ ...form, cliArgs: event.target.value })}
                placeholder={'One argument per line, e.g.:\n--cli'}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
              <span className="text-foreground-secondary">CLI resume argument</span>
              <input
                value={form.cliResumeArg}
                onChange={event => setForm({ ...form, cliResumeArg: event.target.value })}
                placeholder="e.g. --session"
              />
            </div>
          </div>
        ) : null}
      </FormDialog>

      <ConfirmationModal
        isOpen={deleteTarget !== null}
        title="Delete Custom ACP agent configuration"
        message={deleteTarget ? `Do you want to delete "${deleteTarget.name}"?` : ''}
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => {
          if (!deleteTarget) return;
          save(configs.filter(config => config.id !== deleteTarget.id));
          if (editingId === deleteTarget.id) closeForm();
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
