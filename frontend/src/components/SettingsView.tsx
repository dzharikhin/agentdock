import { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import {
  AgentOption,
  AudioTranscriptionSettings,
  GitCommitGenerationSettings as GitCommitGenerationSettingsValue,
  GlobalSettingsPayload
} from '../types/chat';
import { ACPBridge } from '../utils/bridge';
import { AudioTranscriptionSettingsView } from './audio/AudioTranscriptionSettingsView';
import { normalizeAudioTranscriptionProvider } from './audio/audioTranscription';
import { GitCommitGenerationSettings } from './settings/GitCommitGenerationSettings';
import { SettingsCheckbox, SettingsField, SettingsSection } from './settings/SettingsLayout';
import { Tooltip } from './chat/shared/Tooltip';
import { SectionPage } from './ui/SectionPage';
import { DropdownOption, DropdownSelect } from './ui/DropdownSelect';

function normalizeGitCommitGenerationSettings(
  payload: Partial<GitCommitGenerationSettingsValue> | undefined
): GitCommitGenerationSettingsValue {
  return {
    enabled: Boolean(payload?.enabled),
    adapterId: payload?.adapterId?.trim() ?? '',
    modelId: payload?.modelId?.trim() ?? '',
    reasoningEffortId: payload?.reasoningEffortId?.trim() ?? '',
    instructions: payload?.instructions ?? ''
  };
}

const UI_ZOOM_PRESETS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];
const CONTENT_MAX_WIDTH_PRESETS = [500, 600, 680, 720, 740, 760, 780, 800, 840, 900, 0];
const SIDEBAR_POSITION_OPTIONS: DropdownOption[] = [
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
];

function normalizeUiZoomPercent(value: unknown): number {
  const percent = Math.round(Number(value));
  if (!Number.isFinite(percent)) return 100;
  return Math.max(25, Math.min(500, percent));
}

function zoomSelectOptions(currentPercent: number): DropdownOption[] {
  const percents = UI_ZOOM_PRESETS.includes(currentPercent)
    ? UI_ZOOM_PRESETS
    : [...UI_ZOOM_PRESETS, currentPercent].sort((left, right) => left - right);
  return percents.map((percent) => ({
    value: String(percent),
    label: `${percent}%`
  }));
}

function contentMaxWidthOptions(currentPx: number): DropdownOption[] {
  const widths = CONTENT_MAX_WIDTH_PRESETS.includes(currentPx)
    ? CONTENT_MAX_WIDTH_PRESETS
    : [currentPx, ...CONTENT_MAX_WIDTH_PRESETS];
  return widths.map((width) => ({
    value: String(width),
    label: width ? `${width}px` : 'Unlimited'
  }));
}

function readUiZoom() {
  (
    window as Window & { __agentDockInvoke?: (name: string, payload?: string) => void }
  ).__agentDockInvoke?.('readUiZoom', '');
}

function normalizeGlobalSettings(payload: Partial<GlobalSettingsPayload> | undefined): GlobalSettingsPayload {
  return {
    settings: {
      audioNotificationsEnabled: payload?.settings?.audioNotificationsEnabled ?? true,
      uiZoomPercent: normalizeUiZoomPercent(payload?.settings?.uiZoomPercent),
      contentMaxWidthPx: payload?.settings?.contentMaxWidthPx ?? 760,
      userMessageBackgroundStyle: payload?.settings?.userMessageBackgroundStyle === 'custom' || userMessageBackgroundOptions.some(
        (option) => option.id === payload?.settings?.userMessageBackgroundStyle
      )
        ? payload!.settings!.userMessageBackgroundStyle
        : 'default',
      userMessageCustomColor: /^#[0-9a-fA-F]{6}$/.test(payload?.settings?.userMessageCustomColor ?? '')
        ? payload!.settings!.userMessageCustomColor : '#193d70',
      audioTranscription: {
        provider: normalizeAudioTranscriptionProvider(payload?.settings?.audioTranscription?.provider),
        language: payload?.settings?.audioTranscription?.language ?? 'auto',
        providers: payload?.settings?.audioTranscription?.providers ?? {}
      },
      gitCommitGeneration: normalizeGitCommitGenerationSettings(payload?.settings?.gitCommitGeneration),
      quotaWidgetEnabled: payload?.settings?.quotaWidgetEnabled ?? false,
      openInEditor: payload?.settings?.openInEditor ?? true,
      promptNavigationHoverOnly: payload?.settings?.promptNavigationHoverOnly ?? true,
      sidebarEnabled: payload?.settings?.sidebarEnabled ?? true,
      sidebarPosition: payload?.settings?.sidebarPosition === 'right' ? 'right' : 'left'
    }
  };
}

const userMessageBackgroundOptions: Array<{
  id: GlobalSettingsPayload['settings']['userMessageBackgroundStyle'];
  toneClass: string;
}> = [
  { id: 'default', toneClass: 'bg-user-message-default' },
  { id: 'blue-highlight', toneClass: 'bg-user-message-blue-highlight' },
  { id: 'blue', toneClass: 'bg-user-message-blue' },
  { id: 'accent', toneClass: 'bg-accent' },
  { id: 'background-secondary', toneClass: 'bg-background-secondary' },
];

export function SettingsView() {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettingsPayload>(() =>
    normalizeGlobalSettings(ACPBridge.getGlobalSettingsSnapshot())
  );
  const [installedAgents, setInstalledAgents] = useState<AgentOption[]>([]);
  const liveZoomRef = useRef<number | null>(null);
  const persistLiveZoomRef = useRef(false);

  useEffect(() => {
    const requestSettings = () => {
      ACPBridge.requestAdapters();
    };

    const cleanupGlobalSettings = ACPBridge.onGlobalSettings((e) => {
      const normalized = normalizeGlobalSettings(e.detail?.payload);
      if (liveZoomRef.current != null) {
        normalized.settings.uiZoomPercent = liveZoomRef.current;
      }
      setGlobalSettings(normalized);
    });
    const onUiZoom = (event: Event) => {
      const percent = Number((event as CustomEvent).detail);
      if (!Number.isFinite(percent)) return;
      liveZoomRef.current = percent;
      setGlobalSettings((prev) => {
        const next = { ...prev.settings, uiZoomPercent: percent };
        if (persistLiveZoomRef.current) {
          ACPBridge.saveGlobalSettings(next);
        }
        return { ...prev, settings: next };
      });
    };
    window.addEventListener('agent-dock-ui-zoom', onUiZoom);
    const cleanupAdapters = ACPBridge.onAdapters((e) => {
      const nextInstalledAgents = Array.isArray(e.detail.adapters)
        ? e.detail.adapters.filter((agent) => agent.downloaded === true)
        : [];
      setInstalledAgents(nextInstalledAgents);
    });

    const handleBridgeReady = () => {
      requestSettings();
    };

    if (window.__settingsBridgeReady) {
      requestSettings();
    } else {
      window.addEventListener('settings-bridge-ready', handleBridgeReady);
    }

    persistLiveZoomRef.current = false;
    readUiZoom();

    let zoomReadTimer: number | undefined;
    const scheduleZoomRead = () => {
      persistLiveZoomRef.current = true;
      window.clearTimeout(zoomReadTimer);
      zoomReadTimer = window.setTimeout(() => readUiZoom(), 50);
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      scheduleZoomRead();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (
        event.code !== 'Equal' &&
        event.code !== 'Minus' &&
        event.code !== 'Digit0' &&
        event.code !== 'NumpadAdd' &&
        event.code !== 'NumpadSubtract' &&
        event.code !== 'Numpad0'
      ) {
        return;
      }
      scheduleZoomRead();
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      cleanupGlobalSettings();
      window.removeEventListener('agent-dock-ui-zoom', onUiZoom);
      cleanupAdapters();
      window.removeEventListener('settings-bridge-ready', handleBridgeReady);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(zoomReadTimer);
    };
  }, []);

  const updateGlobalSettings = (patch: Partial<GlobalSettingsPayload['settings']>) => {
    const next = { ...globalSettings.settings, ...patch };
    setGlobalSettings((prev) => ({ ...prev, settings: next }));
    ACPBridge.saveGlobalSettings(next);
  };

  const updateAudioSettings = (audioTranscription: AudioTranscriptionSettings) => {
    setGlobalSettings((prev) => ({
      ...prev,
      settings: { ...prev.settings, audioTranscription }
    }));
  };

  const saveAudioSettings = (audioTranscription: AudioTranscriptionSettings) => {
    const next = { ...globalSettings.settings, audioTranscription };
    setGlobalSettings((prev) => ({ ...prev, settings: next }));
    ACPBridge.saveGlobalSettings(next);
  };

  return (
    <div className='flex min-h-0 flex-col'>
      <SectionPage padding="pb-12 pt-3">
          <div className='flex flex-col gap-8 px-5 text-ide-small'>
          <SettingsSection title='Appearance' compact>
            <SettingsCheckbox
              title='Open in Editor'
              description='Show the plugin as an editor tab instead of the side tool window'
              checked={globalSettings.settings.openInEditor}
              onToggle={() => updateGlobalSettings({ openInEditor: !globalSettings.settings.openInEditor })}
              ariaLabel='Open in the editor'
            />

            <SettingsCheckbox
              title='Use Sidebar Layout'
              description='Use the sidebar for navigation instead of the horizontal top tabbar'
              checked={globalSettings.settings.sidebarEnabled}
              onToggle={() => updateGlobalSettings({ sidebarEnabled: !globalSettings.settings.sidebarEnabled })}
              ariaLabel='Use sidebar layout'
            />

            <SettingsCheckbox
              title='Hide prompt navigation on the left side of the chat until hover'
              checked={globalSettings.settings.promptNavigationHoverOnly}
              onToggle={() => updateGlobalSettings({ promptNavigationHoverOnly: !globalSettings.settings.promptNavigationHoverOnly })}
              ariaLabel='Hide prompt navigation on the left side of the chat until hover'
            />

            <div className='my-1 grid grid-cols-[max-content_max-content] items-center gap-x-2 gap-y-3'>
              <span className='text-foreground'>Sidebar Position:</span>
              <DropdownSelect
                value={globalSettings.settings.sidebarPosition}
                onChange={(value) => updateGlobalSettings({
                  sidebarPosition: value === 'left' ? 'left' : 'right'
                })}
                options={SIDEBAR_POSITION_OPTIONS}
                disabled={!globalSettings.settings.sidebarEnabled}
                className='max-w-full'
              />

              <span className='text-foreground'>Zoom:</span>
              <DropdownSelect
                value={String(globalSettings.settings.uiZoomPercent)}
                onChange={(value) => {
                  const percent = Number(value);
                  liveZoomRef.current = percent;
                  persistLiveZoomRef.current = false;
                  updateGlobalSettings({ uiZoomPercent: percent });
                }}
                options={zoomSelectOptions(globalSettings.settings.uiZoomPercent)}
                className='max-w-full'
              />

              <span className='text-foreground'>Content Max Width:</span>
              <DropdownSelect
                value={String(globalSettings.settings.contentMaxWidthPx)}
                onChange={(value) => updateGlobalSettings({ contentMaxWidthPx: Number(value) })}
                options={contentMaxWidthOptions(globalSettings.settings.contentMaxWidthPx)}
                className='max-w-full'
              />
            </div>

            <SettingsField
              label='User Message Background'
              description='Choose the background color used for your chat messages'
              stacked
            >
              <div className='flex flex-wrap gap-2'>
                {userMessageBackgroundOptions.map((option) => (
                  <button
                    key={option.id}
                    type='button'
                    onClick={() => updateGlobalSettings({ userMessageBackgroundStyle: option.id })}
                    aria-pressed={globalSettings.settings.userMessageBackgroundStyle === option.id}
                    aria-label={`${option.id} message background`}
                    className={`h-8 w-8 rounded-[4px] border ${option.toneClass} focus:outline-none ${
                      globalSettings.settings.userMessageBackgroundStyle === option.id
                        ? 'border-[var(--ide-Button-focusedBorderColor)] shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)]'
                        : 'border-border'
                    }`}
                  />
                ))}
                <Tooltip variant='minimal' content='Choose custom color'>
                  <label
                    style={{ backgroundColor: 'var(--ide-user-message-custom-bg)' }}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-[4px] border focus-within:ring-1 focus-within:ring-[var(--ide-Button-default-focusColor)] ${
                      globalSettings.settings.userMessageBackgroundStyle === 'custom'
                        ? 'border-[var(--ide-Button-focusedBorderColor)] shadow-[0_0_0_1px_var(--ide-Button-default-focusColor)]'
                        : 'border-border'
                    }`}
                  >
                    <Palette size={16} aria-hidden='true' />
                    <input
                      type='color'
                      aria-label='Custom message background'
                      value={globalSettings.settings.userMessageCustomColor}
                      onClick={() => updateGlobalSettings({ userMessageBackgroundStyle: 'custom' })}
                      onChange={(event) => updateGlobalSettings({
                        userMessageBackgroundStyle: 'custom',
                        userMessageCustomColor: event.target.value
                      })}
                      className='absolute inset-0 h-full w-full cursor-pointer opacity-0'
                    />
                  </label>
                </Tooltip>
              </div>
            </SettingsField>
          </SettingsSection>

          <SettingsSection title='General'>
            <SettingsCheckbox
              title='Audio Notifications'
              description='Play sounds for new assistant messages and quota limit warnings'
              checked={globalSettings.settings.audioNotificationsEnabled}
              onToggle={() =>
                updateGlobalSettings({ audioNotificationsEnabled: !globalSettings.settings.audioNotificationsEnabled })
              }
              ariaLabel='Enable audio notifications'
            />

            <SettingsCheckbox
              title='Status Bar Quota Widget'
              description='Display real-time agent usage quotas in the IDE status bar'
              checked={globalSettings.settings.quotaWidgetEnabled}
              onToggle={() => updateGlobalSettings({ quotaWidgetEnabled: !globalSettings.settings.quotaWidgetEnabled })}
              ariaLabel='Enable status bar quota widget'
            />

            <GitCommitGenerationSettings
              settings={globalSettings.settings.gitCommitGeneration}
              installedAgents={installedAgents}
              onChange={(gitCommitGeneration) => updateGlobalSettings({ gitCommitGeneration })}
            />
          </SettingsSection>

          <AudioTranscriptionSettingsView
            settings={globalSettings.settings.audioTranscription}
            onSettingsChange={updateAudioSettings}
            onSettingsSave={saveAudioSettings}
          />
          </div>
      </SectionPage>
    </div>
  );
}
