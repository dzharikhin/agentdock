import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentOption,
  ConfigOption,
  SessionConfigOptionsPayload,
} from '../../types/chat';
import { ACPBridge } from '../../utils/bridge';
import {
  buildModeProfileSnapshot,
  findReasoningEffortOption,
  resolveModeProfileValues,
} from '../../utils/configOptions';

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

  const effectiveOptions = useMemo(() => optionsForModel(
    options,
    sessionConfigOptions?.configOptionsByModel ?? effectiveSelectedAgent?.configOptionsByModel,
    selectedModelId,
  ), [
    effectiveSelectedAgent?.configOptionsByModel,
    options,
    selectedModelId,
    sessionConfigOptions?.configOptionsByModel,
  ]);
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
  const modeConfigOptions = effectiveSelectedAgent?.modeConfigOptions ?? {};
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
    if (remember) ACPBridge.rememberAgentConfigOption(targetAgentId, configId, value);
    setSelectedByAgent((current) => ({
      ...current,
      [targetAgentId]: {
        ...current[targetAgentId],
        [configId]: value,
      },
    }));
  };

  const selectConfigValue = (configId: string, value: string, targetAgentId = selectedAgentId) =>
    updateConfigValue(configId, value, targetAgentId, true);

  const rememberModeConfigValues = (modeId: string, values: Record<string, string>, targetAgentId = selectedAgentId) => {
    if (!targetAgentId || !modeId) return;
    const nonEmpty = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    if (Object.keys(nonEmpty).length === 0) return;
    ACPBridge.rememberAgentModeConfigOptions(targetAgentId, modeId, nonEmpty);
  };

  const switchMode = (value: string, rememberChoice: boolean) => {
    if (!modeOption || !selectedAgentId || !value) return;
    const modeChanged = selectedModeId !== value;
    if (modeChanged && selectedModeId) {
      rememberModeConfigValues(selectedModeId, buildModeProfileSnapshot(
        modelOption?.id,
        reasoningOption?.id,
        selectedModelId,
        selectedReasoningEffortId
      ));
    }
    const override = modeChanged
      ? resolveModeProfileValues(modeConfigOptions[value], modelOption, reasoningOption?.id)
      : {};
    if (rememberChoice) ACPBridge.rememberAgentConfigOption(selectedAgentId, modeOption.id, value);
    setSelectedByAgent((current) => ({
      ...current,
      [selectedAgentId]: {
        ...current[selectedAgentId],
        [modeOption.id]: value,
        ...(override.modelId !== undefined && modelOption ? { [modelOption.id]: override.modelId } : {}),
        ...(override.effortId !== undefined && reasoningOption ? { [reasoningOption.id]: override.effortId } : {}),
      },
    }));
  };

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
    if (!option) return;
    selectConfigValue(option.id, modelId, agentId);
    if (agentId === selectedAgentId && selectedModeId) {
      rememberModeConfigValues(selectedModeId, { [option.id]: modelId });
    }
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
    modelIdForStart: selectedAgentId ? selectedModelId : '',
    handleSessionConfigOptions,
    handleModelChange,
    handleReportedModeChange: (value: string) => switchMode(value, false),
    handleModeChange: (value: string) => switchMode(value, true),
    handleReasoningEffortChange: (value: string) => {
      if (!reasoningOption) return;
      selectConfigValue(reasoningOption.id, value);
      if (selectedModeId) rememberModeConfigValues(selectedModeId, { [reasoningOption.id]: value });
    },
    handleConfigOptionChange: selectConfigValue,
  };
}
