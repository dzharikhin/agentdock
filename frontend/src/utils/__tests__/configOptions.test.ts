import { describe, expect, it } from 'vitest';
import { ConfigOption } from '../../types/chat';
import { buildModeProfileSnapshot, resolveModeProfileValues } from '../configOptions';

const modelOption: ConfigOption = {
  id: 'model',
  name: 'Model',
  type: 'select',
  options: [
    { value: 'gpt-x', name: 'GPT X' },
    { value: 'claude-y', name: 'Claude Y' },
  ],
};

describe('buildModeProfileSnapshot', () => {
  it('maps selected model and effort to their config ids', () => {
    expect(buildModeProfileSnapshot('model', 'effort', 'gpt-x', 'high'))
      .toEqual({ model: 'gpt-x', effort: 'high' });
  });

  it('omits empty values and missing config ids', () => {
    expect(buildModeProfileSnapshot('model', 'effort', '', 'high')).toEqual({ effort: 'high' });
    expect(buildModeProfileSnapshot(undefined, 'effort', 'gpt-x', 'high')).toEqual({ effort: 'high' });
    expect(buildModeProfileSnapshot('model', undefined, 'gpt-x', '')).toEqual({ model: 'gpt-x' });
    expect(buildModeProfileSnapshot(undefined, undefined, 'gpt-x', 'high')).toEqual({});
  });
});

describe('resolveModeProfileValues', () => {
  it('returns profile model and effort by config id', () => {
    expect(resolveModeProfileValues({ model: 'claude-y', effort: 'low' }, modelOption, 'effort'))
      .toEqual({ modelId: 'claude-y', effortId: 'low' });
  });

  it('drops a model the agent no longer offers but keeps effort', () => {
    expect(resolveModeProfileValues({ model: 'removed-model', effort: 'low' }, modelOption, 'effort'))
      .toEqual({ effortId: 'low' });
  });

  it('returns partial overrides when only one value is remembered', () => {
    expect(resolveModeProfileValues({ effort: 'low' }, modelOption, 'effort'))
      .toEqual({ effortId: 'low' });
    expect(resolveModeProfileValues({ model: 'gpt-x' }, modelOption, 'effort'))
      .toEqual({ modelId: 'gpt-x' });
  });

  it('returns nothing without a profile or without matching keys', () => {
    expect(resolveModeProfileValues(undefined, modelOption, 'effort')).toEqual({});
    expect(resolveModeProfileValues({}, modelOption, 'effort')).toEqual({});
    expect(resolveModeProfileValues({ model: 'gpt-x' }, undefined, undefined)).toEqual({});
    expect(resolveModeProfileValues({ effort: 'low' }, modelOption, undefined)).toEqual({});
  });
});
