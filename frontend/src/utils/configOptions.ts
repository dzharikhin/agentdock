import { ConfigOption } from '../types/chat';

const REASONING_EFFORT_IDS = ['effort', 'reasoning_effort'];

export function findReasoningEffortOption(options: ConfigOption[]): ConfigOption | undefined {
  return options.find((option) => REASONING_EFFORT_IDS.includes(option.id))
    ?? options.find((option) => option.id === 'thought_level')
    ?? options.find((option) => option.category === 'thought_level');
}

export type ModeProfileOverride = {
  modelId?: string;
  effortId?: string;
};

export function buildModeProfileSnapshot(
  modelConfigId: string | undefined,
  effortConfigId: string | undefined,
  modelId: string,
  effortId: string
): Record<string, string> {
  const values: Record<string, string> = {};
  if (modelConfigId && modelId) values[modelConfigId] = modelId;
  if (effortConfigId && effortId) values[effortConfigId] = effortId;
  return values;
}

export function resolveModeProfileValues(
  profile: Record<string, string> | undefined,
  modelOption: ConfigOption | undefined,
  effortConfigId: string | undefined
): ModeProfileOverride {
  if (!profile) return {};
  const override: ModeProfileOverride = {};
  const modelId = modelOption?.id ? profile[modelOption.id] : undefined;
  if (modelId && modelOption?.options.some((option) => option.value === modelId)) {
    override.modelId = modelId;
  }
  const effortId = effortConfigId ? profile[effortConfigId] : undefined;
  if (effortId) override.effortId = effortId;
  return override;
}
