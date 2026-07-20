import { describe, expect, it } from 'vitest';
import type { TitleEquivalenceClass } from '@german-smart-apply/shared';
import {
  buildProposalTool,
  buildOpenRouterProposalTool,
  proposeClassAssignment,
  proposeClassAssignmentViaOpenRouter,
  type AnthropicLikeClient,
  type OpenAiLikeClient,
} from './propose-class-assignment.js';

const TEST_CLASSES: TitleEquivalenceClass[] = [
  { id: 'software-engineer', members: ['software engineer', 'software developer', 'full stack developer'] },
];

describe('buildProposalTool', () => {
  it('enumerates every known class id plus "none"', () => {
    const tool = buildProposalTool(TEST_CLASSES);
    expect(tool.input_schema.properties.proposedClassId.enum).toEqual(['software-engineer', 'none']);
  });

  it('forces all three required fields', () => {
    const tool = buildProposalTool(TEST_CLASSES);
    expect(tool.input_schema.required).toEqual(['proposedClassId', 'confidence', 'reasoning']);
  });
});

describe('proposeClassAssignment', () => {
  function fakeClient(toolInput: unknown): AnthropicLikeClient {
    return {
      messages: {
        create: async () => ({
          content: [{ type: 'tool_use', name: 'propose_title_class_assignment', input: toolInput }],
        }),
      },
    };
  }

  it('returns the parsed tool_use input on a well-formed response', async () => {
    const client = fakeClient({ proposedClassId: 'software-engineer', confidence: 0.9, reasoning: 'Same occupation, different phrasing.' });
    const result = await proposeClassAssignment(client, 'Backend Engineer', TEST_CLASSES, 'claude-sonnet-5');
    expect(result).toEqual({ proposedClassId: 'software-engineer', confidence: 0.9, reasoning: 'Same occupation, different phrasing.' });
  });

  it('throws loudly if the model does not return the expected tool_use block (no silent guess)', async () => {
    const client: AnthropicLikeClient = {
      messages: { create: async () => ({ content: [{ type: 'text' }] }) },
    };
    await expect(proposeClassAssignment(client, 'Backend Engineer', TEST_CLASSES, 'claude-sonnet-5')).rejects.toThrow(/did not return the expected/);
  });

  it('throws if the tool_use input is not an object', async () => {
    const client = fakeClient('not-an-object');
    await expect(proposeClassAssignment(client, 'Backend Engineer', TEST_CLASSES, 'claude-sonnet-5')).rejects.toThrow(/did not return the expected/);
  });

  it('passes the candidate title and class members into the request', async () => {
    let capturedParams: unknown;
    const client: AnthropicLikeClient = {
      messages: {
        create: async (params) => {
          capturedParams = params;
          return { content: [{ type: 'tool_use', name: 'propose_title_class_assignment', input: { proposedClassId: 'none', confidence: 0.1, reasoning: 'n/a' } }] };
        },
      },
    };
    await proposeClassAssignment(client, 'Registered Nurse', TEST_CLASSES, 'claude-sonnet-5');
    expect(JSON.stringify(capturedParams)).toContain('Registered Nurse');
    expect(JSON.stringify(capturedParams)).toContain('software-engineer');
    expect((capturedParams as { tool_choice: unknown }).tool_choice).toEqual({ type: 'tool', name: 'propose_title_class_assignment' });
  });
});

describe('buildOpenRouterProposalTool', () => {
  it('wraps the same JSON schema in OpenAI\'s function-tool envelope', () => {
    const anthropicTool = buildProposalTool(TEST_CLASSES);
    const openRouterTool = buildOpenRouterProposalTool(TEST_CLASSES);
    expect(openRouterTool.type).toBe('function');
    expect(openRouterTool.function.name).toBe(anthropicTool.name);
    expect(openRouterTool.function.parameters).toEqual(anthropicTool.input_schema);
  });
});

describe('proposeClassAssignmentViaOpenRouter', () => {
  function fakeToolCallClient(toolInput: unknown): OpenAiLikeClient {
    return {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  tool_calls: [{ type: 'function', function: { name: 'propose_title_class_assignment', arguments: JSON.stringify(toolInput) } }],
                },
              },
            ],
          }),
        },
      },
    };
  }

  it('parses a real tool_calls response', async () => {
    const client = fakeToolCallClient({ proposedClassId: 'software-engineer', confidence: 0.85, reasoning: 'Same occupation.' });
    const result = await proposeClassAssignmentViaOpenRouter(client, 'Backend Engineer', TEST_CLASSES, 'openai/gpt-oss-120b:free');
    expect(result).toEqual({ proposedClassId: 'software-engineer', confidence: 0.85, reasoning: 'Same occupation.' });
  });

  it('falls back to parsing bare JSON from message content when the model ignores tool_choice', async () => {
    const client: OpenAiLikeClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify({ proposedClassId: 'none', confidence: 0.2, reasoning: 'Different field.' }) } }],
          }),
        },
      },
    };
    const result = await proposeClassAssignmentViaOpenRouter(client, 'Real Estate Developer', TEST_CLASSES, 'openai/gpt-oss-120b:free');
    expect(result.proposedClassId).toBe('none');
  });

  it('strips a ```json code fence from the fallback content parse', async () => {
    const client: OpenAiLikeClient = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: '```json\n{"proposedClassId":"none","confidence":0.1,"reasoning":"n/a"}\n```' } }],
          }),
        },
      },
    };
    const result = await proposeClassAssignmentViaOpenRouter(client, 'Some Title', TEST_CLASSES, 'openai/gpt-oss-120b:free');
    expect(result.proposedClassId).toBe('none');
  });

  it('throws loudly when neither tool_calls nor content parses', async () => {
    const client: OpenAiLikeClient = {
      chat: { completions: { create: async () => ({ choices: [{ message: {}, finish_reason: 'stop' }] }) } },
    };
    await expect(proposeClassAssignmentViaOpenRouter(client, 'Some Title', TEST_CLASSES, 'openai/gpt-oss-120b:free')).rejects.toThrow(/got neither/);
  });
});
