import { useSyncExternalStore } from 'react';
import { marked, type Token, type Tokens } from 'marked';
import type { AudioOutputSettings } from '../../types/chat';
import { ACPBridge } from '../../utils/bridge';

export const AUDIO_OUTPUT_NONE = 'none';
export const SYSTEM_VOICES = 'system';
export const GPT_SPEECH = 'gpt-speech';
export const GEMINI_SPEECH = 'gemini-speech';

export interface SpeechProviderDefinition {
  value: string;
  label: string;
  apiKeyLabel?: string;
  apiKeyPlaceholder?: string;
  apiKeyUrl?: string;
  pricingDescription?: string;
  /** The first voice matches the Kotlin default used while none is selected. */
  voices?: string[];
}

export const speechProviders: SpeechProviderDefinition[] = [
  { value: AUDIO_OUTPUT_NONE, label: 'None' },
  { value: SYSTEM_VOICES, label: 'System voices' },
  {
    value: GPT_SPEECH,
    label: 'GPT Speech',
    apiKeyLabel: 'OpenAI API key',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    pricingDescription: 'GPT-4o mini TTS costs ~$0.015 per audio minute.',
    voices: ['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'],
  },
  {
    value: GEMINI_SPEECH,
    label: 'Gemini 3.8 Flash-Lite TTS',
    apiKeyLabel: 'Google Gemini API key',
    apiKeyPlaceholder: 'AIza...',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    pricingDescription: 'Free tier available with limited quotas. Paid: ~$0.009/audio minute',
    voices: [
      'Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
      'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
      'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
      'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
    ],
  },
];

const speechProviderIds = new Set(speechProviders.map(({ value }) => value));

export function normalizeAudioOutputSettings(settings: Partial<AudioOutputSettings> | undefined): AudioOutputSettings {
  const provider = settings?.provider?.trim().toLowerCase();
  return {
    provider: provider && speechProviderIds.has(provider) ? provider : SYSTEM_VOICES,
    providers: settings?.providers ?? {},
  };
}

export type SpeechState =
  | { status: 'unavailable' | 'idle' | 'speaking' }
  | { status: 'error'; error: string };

const UNAVAILABLE: SpeechState = { status: 'unavailable' };
const IDLE: SpeechState = { status: 'idle' };
const SPEAKING: SpeechState = { status: 'speaking' };
// Cloud requests are split well below the providers' limits (OpenAI accepts 4096 characters).
const CLOUD_CHUNK_CHARS = 3000;

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

interface SpeechSnapshot {
  settings: AudioOutputSettings;
  voices: SpeechSynthesisVoice[];
  speakingId: string | null;
  failure: { id: string; state: SpeechState } | null;
}

let snapshot: SpeechSnapshot = {
  settings: normalizeAudioOutputSettings(undefined),
  voices: [],
  speakingId: null,
  failure: null,
};
let speechRun = 0;
const listeners = new Set<() => void>();
let disconnect: (() => void) | undefined;

function publish(patch: Partial<SpeechSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

export function stopSpeech(id?: string) {
  const { speakingId } = snapshot;
  if (speakingId === null || (id !== undefined && speakingId !== id)) return;
  speechRun++;
  synth?.cancel();
  ACPBridge.stopSpeech(speakingId);
  publish({ speakingId: null });
}

function connect() {
  const updateVoices = () => publish({ voices: synth?.getVoices() ?? [] });
  const updateSettings = (settings: AudioOutputSettings | undefined) => {
    const next = normalizeAudioOutputSettings(settings);
    if (next.provider !== snapshot.settings.provider) stopSpeech();
    if (JSON.stringify(next) !== JSON.stringify(snapshot.settings)) publish({ settings: next });
  };
  synth?.addEventListener('voiceschanged', updateVoices);
  const cleanupSettings = ACPBridge.onGlobalSettings(e => updateSettings(e.detail.payload?.settings?.audioOutput));
  const cleanupResult = ACPBridge.onSpeechResult((e) => {
    const { requestId, error } = e.detail.payload;
    if (requestId !== snapshot.speakingId) return;
    publish({
      speakingId: null,
      failure: error ? { id: requestId, state: { status: 'error', error } } : null,
    });
  });
  snapshot = {
    ...snapshot,
    settings: normalizeAudioOutputSettings(ACPBridge.getGlobalSettingsSnapshot()?.settings?.audioOutput),
    voices: synth?.getVoices() ?? [],
  };
  return () => {
    synth?.removeEventListener('voiceschanged', updateVoices);
    cleanupSettings();
    cleanupResult();
  };
}

// Share voice, settings and result subscriptions only while speech controls or settings are mounted.
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) disconnect = connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      disconnect?.();
      disconnect = undefined;
    }
  };
}

export function useSystemVoices() {
  return useSyncExternalStore(subscribe, () => snapshot.voices);
}

function isAvailable({ settings, voices }: SpeechSnapshot) {
  if (settings.provider === SYSTEM_VOICES) return voices.length > 0;
  return Boolean(settings.providers[settings.provider]?.apiKey?.trim());
}

export function useSpeechState(id: string): SpeechState {
  return useSyncExternalStore(subscribe, () => {
    if (snapshot.speakingId === id) return SPEAKING;
    if (!isAvailable(snapshot)) return UNAVAILABLE;
    return snapshot.failure?.id === id ? snapshot.failure.state : IDLE;
  });
}

/** Reads markdown aloud, or stops if this id is already being read. */
export function toggleSpeech(id: string, markdown: string) {
  const wasSpeaking = snapshot.speakingId === id;
  stopSpeech();
  if (snapshot.failure) publish({ failure: null });
  if (wasSpeaking || !isAvailable(snapshot)) return;

  const segments = speechSegments(marked.lexer(markdown));
  if (segments.length === 0) return;
  if (snapshot.settings.provider === SYSTEM_VOICES) {
    speakWithSystemVoice(segments);
  } else {
    ACPBridge.startSpeech(id, speechChunks(segments));
  }
  publish({ speakingId: id });
}

// One utterance per block keeps the pauses between paragraphs and list items.
function speakWithSystemVoice(segments: string[]) {
  if (!synth) return;
  const run = speechRun;
  const voiceUri = snapshot.settings.providers[SYSTEM_VOICES]?.voice;
  const voice = snapshot.voices.find(({ voiceURI }) => voiceURI === voiceUri);
  segments.forEach((text, index) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    if (index === segments.length - 1) {
      utterance.onend = utterance.onerror = () => {
        if (run === speechRun) publish({ speakingId: null });
      };
    }
    synth.speak(utterance);
  });
}

// Each cloud request costs latency and quota, so blocks are joined into as few requests as fit.
function speechChunks(segments: string[]): string[] {
  const chunks: string[] = [];
  let current = '';
  segments.flatMap(splitLongSegment).forEach((segment) => {
    if (current && current.length + segment.length + 2 > CLOUD_CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${segment}` : segment;
  });
  if (current) chunks.push(current);
  return chunks;
}

function splitLongSegment(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > CLOUD_CHUNK_CHARS) {
    const space = rest.lastIndexOf(' ', CLOUD_CHUNK_CHARS);
    const cut = space > 0 ? space : CLOUD_CHUNK_CHARS;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  return [...parts, rest];
}

// Code blocks, images and raw HTML are skipped; list items and table rows become separate blocks.
function speechSegments(tokens: Token[]): string[] {
  return tokens.flatMap((token): string[] => {
    switch (token.type) {
      case 'code':
      case 'html':
      case 'hr':
      case 'space':
      case 'def':
        return [];
      case 'list':
        return (token as Tokens.List).items.flatMap(item => speechSegments(item.tokens));
      case 'table': {
        const table = token as Tokens.Table;
        return [table.header, ...table.rows].map(row => row.map(cell => inlineText(cell.tokens)).join(', '));
      }
      case 'blockquote':
        return speechSegments((token as Tokens.Blockquote).tokens);
      default:
        return [inlineText([token])];
    }
  }).map(text => text.trim()).filter(Boolean);
}

function inlineText(tokens: Token[]): string {
  return tokens.map((token) => {
    if (token.type === 'image' || token.type === 'html' || token.type === 'checkbox') return '';
    if (token.type === 'br') return ' ';
    const { tokens: children, text } = token as Tokens.Generic;
    return children?.length ? inlineText(children) : text ?? '';
  }).join('');
}
