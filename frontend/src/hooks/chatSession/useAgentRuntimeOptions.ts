import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentOption,
  ConfigLinks,
  ConfigOption,
  SessionConfigOptionsPayload,
} from '../../types/chat';
import { ACPBridge } from '../../utils/bridge';
import { findReasoningEffortOption } from '../../utils/configOptions';

type UseAgentRuntimeOptionsArgs = {
  availableAgents: AgentOption[];
  effectiveSelectedAgent: AgentOption | undefined;
  selectedAgentId: string;
  sessionActive: boolean;
};

const matches = (option: ConfigOption, category: string) =>
  option.id === category || option.category === category;

const findOption = (options: ConfigOption[], category: string) =>
  options.find((option) => option.id === category)
  ?? options.find((option) => option.category === category);

const accepts = (option: ConfigOption, value?: string) =>
  !!value && (option.type === 'boolean'
    ? value === 'true' || value === 'false'
    : option.options.some((item) => item.value === value));

const resolveValue = (option: ConfigOption, value?: string) =>
  accepts(option, value) ? value! : option.options[0]?.value ?? (option.type === 'boolean' ? 'false' : '');

const optionsForModel = (options: ConfigOption[], byModel: Record<string, ConfigOption[]> | undefined, modelId: string) => {
  const model = findOption(options, 'model');
  // A cached model catalog must not replace the session's current model list.
  return (byModel?.[modelId] ?? options).map((option) => model && option.id === model.id ? model : option);
};

const rememberModelAndEffort = () =>
  ACPBridge.getGlobalSettingsSnapshot()?.settings?.rememberModelAndEffort === true;

type ModeModelEffort = { mode: string; model: string; effort: string };

// The values to select and the links to remember when the mode, model or effort changes
// while the mode remembers its model and the model its effort; undefined for other options.
const linkedChange = (
  options: ConfigOption[],
  byModel: Record<string, ConfigOption[]> | undefined,
  links: ConfigLinks,
  current: ModeModelEffort,
  configId: string,
  value: string,
) => {
  const model = findOption(options, 'model');
  const currentOptions = optionsForModel(options, byModel, current.model);
  const mode = findOption(currentOptions, 'mode');
  const next = { ...current };
  if (configId === mode?.id) {
    next.mode = value;
    const savedModel = links.modelByMode?.[value];
    if (model && accepts(model, savedModel)) next.model = savedModel!;
  } else if (configId === model?.id) {
    next.model = value;
  } else if (configId === findReasoningEffortOption(currentOptions)?.id) {
    next.effort = value;
  } else {
    return undefined;
  }
  const effort = findReasoningEffortOption(optionsForModel(options, byModel, next.model));
  const savedEffort = links.effortByModel?.[next.model];
  if (next.model !== current.model && effort && accepts(effort, savedEffort)) next.effort = savedEffort!;

  const values = { [configId]: value };
  if (model && next.model !== current.model) values[model.id] = next.model;
  if (effort && next.effort !== current.effort) values[effort.id] = next.effort;
  const pair = (key: string, item: string): Record<string, string> => (key && item ? { [key]: item } : {});
  return {
    values,
    links: {
      modelByMode: { ...pair(current.mode, current.model), ...pair(next.mode, next.model) },
      effortByModel: {
        ...pair(current.model, current.effort),
        ...pair(next.model, effort ? resolveValue(effort, next.effort) : ''),
      },
    },
  };
};

const EMPTY_SELECTION: Record<string, string> = {};

export function useAgentRuntimeOptions({
  availableAgents,
  effectiveSelectedAgent,
  selectedAgentId,
  sessionActive,
}: UseAgentRuntimeOptionsArgs) {
  const [sessionConfigOptions, setSessionConfigOptions] = useState<SessionConfigOptionsPayload>();
  const [selectedByAgent, setSelectedByAgent] = useState<Record<string, Record<string, string>>>({});
  const initialValuesByAgent = useRef<Record<string, Record<string, string>>>({});
  const sessionAgentId = effectiveSelectedAgent?.id;
  const adapterOptions = effectiveSelectedAgent?.configOptions ?? [];
  if (!sessionActive && sessionAgentId && adapterOptions.length > 0) {
    initialValuesByAgent.current[sessionAgentId] = Object.fromEntries(adapterOptions.map((option) => [
      option.id,
      accepts(option, option.currentValue)
        ? option.currentValue ?? ''
        : option.options[0]?.value ?? '',
    ]));
  }
  const initialValues = sessionAgentId
    ? initialValuesByAgent.current[sessionAgentId] ?? EMPTY_SELECTION
    : EMPTY_SELECTION;
  const options = sessionConfigOptions?.configOptions ?? effectiveSelectedAgent?.configOptions ?? [];
  const selected = effectiveSelectedAgent
    ? selectedByAgent[effectiveSelectedAgent.id] ?? EMPTY_SELECTION
    : EMPTY_SELECTION;
  const modelOption = findOption(options, 'model');
  const modelValue = selected[modelOption?.id ?? ''];
  const initialModelValue = initialValues[modelOption?.id ?? ''];
  const selectedModelId = modelOption
    ? resolveValue(modelOption, modelValue ?? initialModelValue)
    : '';

  const configOptionsByModel = sessionConfigOptions?.configOptionsByModel ?? effectiveSelectedAgent?.configOptionsByModel;
  const effectiveOptions = useMemo(
    () => optionsForModel(options, configOptionsByModel, selectedModelId),
    [configOptionsByModel, options, selectedModelId]
  );
  const configValues = useMemo(() => Object.fromEntries(effectiveOptions
    .filter((option) => option.type !== 'select' || option.options.length > 0)
    .map((option) => {
      const selectedValue = selected[option.id];
      const initialValue = initialValues[option.id];
      const value = resolveValue(option, selectedValue ?? initialValue);
      return [option.id, value];
    })
    .filter(([, value]) => value !== '')),
    [effectiveOptions, initialValues, selected]
  );
  const selectedConfigOptions = effectiveOptions
    .filter((option) => configValues[option.id] !== undefined)
    .map((option) => {
      const value = configValues[option.id];
      return {
        id: option.id,
        name: option.name,
        value,
        displayValue: option.options.find((candidate) => candidate.value === value)?.name ?? value,
      };
    });

  const modeOption = findOption(effectiveOptions, 'mode');
  const reasoningOption = findReasoningEffortOption(effectiveOptions);
  const selectedModeId = modeOption ? configValues[modeOption.id] ?? '' : '';
  const selectedReasoningEffortId = reasoningOption ? configValues[reasoningOption.id] ?? '' : '';
  const availableModes = modeOption?.options.map((option) => ({
    id: option.value,
    name: option.name,
    description: option.description,
  })) ?? [];
  const availableReasoningEfforts = reasoningOption?.options.map((option) => ({
    id: option.value,
    name: option.name,
    description: option.description,
  })) ?? [];
  const additionalConfigOptions = effectiveOptions
    .filter((option) => option.id !== modelOption?.id)
    .map((option) => ({ ...option, currentValue: configValues[option.id] ?? option.currentValue ?? '' }));

  const handleSessionConfigOptions = useCallback((payload: SessionConfigOptionsPayload, preserveSelection = false) => {
    if (!sessionAgentId) return;
    setSessionConfigOptions(payload);
    if (preserveSelection) return;
    setSelectedByAgent((current) => {
      const values = { ...initialValues, ...current[sessionAgentId] };
      if (payload.applyCurrentValues) {
        payload.configOptions.forEach((option) => {
          if (option.currentValue) values[option.id] = option.currentValue;
        });
      } else {
        const model = findOption(payload.configOptions, 'model');
        const modelId = model ? resolveValue(model, values[model.id]) : '';
        optionsForModel(payload.configOptions, payload.configOptionsByModel, modelId).forEach((option) => {
          values[option.id] = resolveValue(option, values[option.id]);
        });
      }
      return { ...current, [sessionAgentId]: values };
    });
  }, [initialValues, sessionAgentId]);

  useEffect(() => setSessionConfigOptions(undefined), [selectedAgentId]);

  const updateConfigValue = (
    configId: string,
    value: string,
    targetAgentId = selectedAgentId,
    remember = false,
  ) => {
    if (!targetAgentId) return;
    const linked = targetAgentId === sessionAgentId && rememberModelAndEffort()
      ? linkedChange(options, configOptionsByModel, effectiveSelectedAgent ?? {}, {
        mode: selectedModeId,
        model: selectedModelId,
        effort: selectedReasoningEffortId,
      }, configId, value)
      : undefined;
    const values = linked?.values ?? { [configId]: value };
    if (remember) ACPBridge.rememberAgentConfigOptions(targetAgentId, values, linked?.links);
    setSelectedByAgent((current) => ({
      ...current,
      [targetAgentId]: {
        ...current[targetAgentId],
        ...values,
      },
    }));
  };

  const selectConfigValue = (configId: string, value: string, targetAgentId = selectedAgentId) =>
    updateConfigValue(configId, value, targetAgentId, true);

  const restoreConfigValues = useCallback((values: Record<string, string>) => {
    if (!selectedAgentId) return;
    setSelectedByAgent((current) => ({ ...current, [selectedAgentId]: { ...values } }));
  }, [selectedAgentId]);

  const handleModelChange = (modelId: string, targetAgentId?: string) => {
    const agentId = targetAgentId || selectedAgentId;
    const agent = availableAgents.find((item) => item.id === agentId)
      ?? (effectiveSelectedAgent?.id === agentId ? effectiveSelectedAgent : undefined);
    const option = agentId === sessionAgentId
      ? modelOption
      : agent?.configOptions?.find((item) => matches(item, 'model'));
    if (option) selectConfigValue(option.id, modelId, agentId);
  };

  return {
    availableModels: modelOption?.options.map((option) => ({
      modelId: option.value,
      name: option.name,
      description: option.description,
    })) ?? [],
    availableModes,
    availableReasoningEfforts,
    additionalConfigOptions,
    configValues,
    selectedConfigOptions,
    restoreConfigValues,
    selectedModelId,
    selectedModeId,
    selectedReasoningEffortId,
    handleSessionConfigOptions,
    handleModelChange,
    handleReportedModeChange: (value: string) =>
      modeOption && updateConfigValue(modeOption.id, value),
    handleModeChange: (value: string) => modeOption && selectConfigValue(modeOption.id, value),
    handleReasoningEffortChange: (value: string) =>
      reasoningOption && selectConfigValue(reasoningOption.id, value),
    handleConfigOptionChange: selectConfigValue,
  };
}
