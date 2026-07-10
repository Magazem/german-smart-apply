import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateProfile, CanonicalJob, MarketPack } from '@german-smart-apply/shared';
import {
  AiProviderError,
  AnthropicAiProvider,
  type AnthropicMessagesClient,
} from './anthropic-provider.js';
import { MODEL_ROUTING } from './types.js';

const profile: CandidateProfile = {
  id: 'p1',
  userId: 'u1',
  fullName: 'Jane Doe',
  targetRole: 'Backend Engineer',
  targetCountryCode: 'DE',
  preferredLanguage: 'en',
  seniority: 'senior',
  locationPreference: 'hybrid',
  skills: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
  summary: null,
  salaryTargetMin: null,
  salaryTargetMax: null,
  workAuthorization: null,
  companyBlacklist: [],
  commutePreferenceKm: null,
  portfolioLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const job: CanonicalJob = {
  jobId: 'j1',
  sourceId: 's1',
  sourceType: 'greenhouse',
  sourceUrl: 'https://example.com',
  originalJobId: 'ext-1',
  companyNameRaw: 'Acme GmbH',
  companyNameNormalized: 'acme gmbh',
  jobTitleRaw: 'Senior Backend Engineer',
  jobTitleNormalized: 'senior backend engineer',
  jobDescriptionHtml: null,
  jobDescriptionText: 'Build APIs.',
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  employmentType: 'full_time',
  seniority: 'senior',
  salaryMin: 70000,
  salaryMax: 90000,
  salaryCurrency: 'EUR',
  techStackTags: ['TypeScript', 'PostgreSQL'],
  applyUrl: 'https://example.com/apply',
  postedAt: null,
  crawledAt: new Date().toISOString(),
  sourceTrustScore: 0.9,
  scamRiskScore: 0.02,
};

const testMarketPack: MarketPack = {
  countryCode: 'DE',
  displayName: 'Germany',
  status: 'active',
  sources: [],
  languagePrompts: {
    cvSummary: 'Summarize this CV in {{language}}.',
    coverLetter: 'Write a cover letter in {{language}} for {{jobTitle}} at {{companyName}}.',
    matchExplanation: 'Explain in {{language}} why this candidate fits {{jobTitle}}.',
  },
  cvFormattingNorms: {
    preferredLengthPages: 2,
    photoExpected: false,
    dateFormat: 'MM/YYYY',
  },
  salaryParsing: { currency: 'EUR', thousandsSeparator: '.', decimalSeparator: ',' },
  locationDictionary: {},
  scamHeuristics: { suspiciousDomainPatterns: [], suspiciousContactPatterns: [] },
  companyAliases: {},
  rankingWeights: {
    titleSimilarity: 0.25,
    skillOverlap: 0.25,
    locationFit: 0.15,
    recency: 0.1,
    salaryFit: 0.1,
    languageFit: 0.05,
    sourceTrust: 0.05,
    riskPenalty: 0.05,
  },
};

function baseUsage(overrides: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    ...overrides,
  };
}

function textMessage(
  text: string,
  overrides: Partial<Anthropic.Message> & { usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  const { usage, ...rest } = overrides;
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    container: null,
    content: [{ type: 'text', text, citations: null }],
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: baseUsage(usage),
    ...rest,
  };
}

function toolUseMessage(
  toolName: string,
  input: unknown,
  overrides: Partial<Anthropic.Message> & { usage?: Partial<Anthropic.Usage> } = {},
): Anthropic.Message {
  const { usage, ...rest } = overrides;
  return {
    id: 'msg_test_tool',
    type: 'message',
    role: 'assistant',
    container: null,
    content: [
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: toolName,
        input,
        caller: { type: 'direct' },
      },
    ],
    model: 'claude-haiku-4-5',
    stop_reason: 'tool_use',
    stop_sequence: null,
    stop_details: null,
    usage: baseUsage(usage),
    ...rest,
  };
}

/** Fake client: records every call and returns whatever `handler` produces. */
function fakeClient(handler: (params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message | Promise<Anthropic.Message>): {
  client: AnthropicMessagesClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => handler(params));
  return { client: { messages: { create } }, create };
}

describe('AnthropicAiProvider', () => {
  describe('parseCv', () => {
    it('routes to the cheap model tier and forces the structured-output tool', async () => {
      const parsedInput = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        summary: 'Experienced backend engineer.',
        skills: ['TypeScript', 'PostgreSQL'],
        experience: [
          { title: 'Engineer', company: 'Acme', startDate: '01/2020', endDate: null, description: 'Built things.' },
        ],
        education: [{ degree: 'BSc CS', institution: 'TU Berlin', startYear: 2016, endYear: 2020 }],
        languages: ['en', 'de'],
        suggestions: ['Add metrics.'],
      };
      const { client, create } = fakeClient(() => toolUseMessage('record_parsed_cv', parsedInput));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      const result = await provider.parseCv('Jane Doe\njane@example.com', 'en');

      expect(create).toHaveBeenCalledTimes(1);
      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(params.model).toBe(MODEL_ROUTING.cheap);
      expect(params.tool_choice).toEqual({ type: 'tool', name: 'record_parsed_cv' });
      expect(params.tools?.[0]?.name).toBe('record_parsed_cv');
      expect(params.system).toContain('en');

      expect(result).toEqual(parsedInput);
    });

    it('throws a malformed_response error when the model does not call the tool', async () => {
      const { client } = fakeClient(() => textMessage('Sure, here is the info...'));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.parseCv('some cv text', 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'malformed_response',
      });
    });

    it('throws a malformed_response error when the tool input is missing required fields', async () => {
      const { client } = fakeClient(() =>
        toolUseMessage('record_parsed_cv', { fullName: 'Jane Doe' /* missing summary */ }),
      );
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.parseCv('some cv text', 'en')).rejects.toThrow(AiProviderError);
      await expect(provider.parseCv('some cv text', 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });

    it('coerces a non-object tool input into a malformed_response error rather than throwing unexpectedly', async () => {
      const { client } = fakeClient(() => toolUseMessage('record_parsed_cv', 'not-an-object'));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.parseCv('cv text', 'en')).rejects.toMatchObject({ code: 'malformed_response' });
    });
  });

  describe('generateCvSuggestions', () => {
    it('routes to the cheap tier, interpolates the market prompt, and returns real usage', async () => {
      const { client, create } = fakeClient(() =>
        toolUseMessage(
          'record_cv_suggestions',
          { suggestions: ['Quantify your impact.', 'Trim the objective section.'] },
          { model: 'claude-haiku-4-5', usage: baseUsage({ input_tokens: 200, output_tokens: 40 }) },
        ),
      );
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      const result = await provider.generateCvSuggestions(profile, job, 'de');

      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(params.model).toBe(MODEL_ROUTING.cheap);
      expect(params.system).toContain('Summarize this CV in de.');
      expect(JSON.stringify(params.messages)).toContain('senior backend engineer');

      expect(result.suggestions).toEqual(['Quantify your impact.', 'Trim the objective section.']);
      expect(result.modelUsed).toBe('claude-haiku-4-5');
      expect(result.tokensUsed).toBe(240);
    });

    it('omits the target-job block from the prompt when no job is given', async () => {
      const { client, create } = fakeClient(() =>
        toolUseMessage('record_cv_suggestions', { suggestions: ['Add metrics.'] }),
      );
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await provider.generateCvSuggestions(profile, null, 'en');

      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(JSON.stringify(params.messages)).not.toContain('Target job');
    });

    it('throws malformed_response when the tool reports no suggestions', async () => {
      const { client } = fakeClient(() => toolUseMessage('record_cv_suggestions', { suggestions: [] }));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateCvSuggestions(profile, null, 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateCvVariant', () => {
    it('routes to the strong model tier and sums cache tokens into tokensUsed', async () => {
      const { client, create } = fakeClient(() =>
        textMessage('Jane Doe - Senior Backend Engineer CV', {
          model: 'claude-sonnet-5',
          usage: baseUsage({
            input_tokens: 300,
            output_tokens: 120,
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 25,
          }),
        }),
      );
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      const result = await provider.generateCvVariant(profile, job, 'en');

      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(params.model).toBe(MODEL_ROUTING.strong);
      expect(result.text).toBe('Jane Doe - Senior Backend Engineer CV');
      expect(result.modelUsed).toBe('claude-sonnet-5');
      expect(result.tokensUsed).toBe(300 + 120 + 50 + 25);
    });

    it('throws malformed_response when the model returns no text content', async () => {
      const { client } = fakeClient(() => textMessage('', { content: [] }));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateCvVariant(profile, job, 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateCoverLetter', () => {
    it('interpolates job title, company name, and language into the market prompt', async () => {
      const { client, create } = fakeClient(() => textMessage('Sehr geehrte Damen und Herren, ...'));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      const result = await provider.generateCoverLetter(profile, job, 'de');

      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(params.model).toBe(MODEL_ROUTING.strong);
      expect(params.system).toContain('Write a cover letter in de for senior backend engineer at acme gmbh.');
      expect(result.text).toContain('Sehr geehrte');
    });
  });

  describe('generateMatchExplanation', () => {
    it('interpolates the match-explanation market prompt', async () => {
      const { client, create } = fakeClient(() => textMessage('Strong match on TypeScript and PostgreSQL.'));
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      const result = await provider.generateMatchExplanation(profile, job, 'en');

      const params = create.mock.calls[0][0] as Anthropic.MessageCreateParamsNonStreaming;
      expect(params.model).toBe(MODEL_ROUTING.strong);
      expect(params.system).toContain('Explain in en why this candidate fits senior backend engineer.');
      expect(result.text).toBe('Strong match on TypeScript and PostgreSQL.');
    });
  });

  describe('error handling', () => {
    it('wraps a 429 rate-limit error from the SDK into a typed rate_limit AiProviderError', async () => {
      const rateLimitError = new Anthropic.RateLimitError(
        429,
        { type: 'rate_limit_error', message: 'slow down' },
        'slow down',
        new Headers(),
      );
      const { client } = fakeClient(() => {
        throw rateLimitError;
      });
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateMatchExplanation(profile, job, 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'rate_limit',
        cause: rateLimitError,
      });
    });

    it('wraps a 401 authentication error from the SDK into a typed auth AiProviderError', async () => {
      const authError = new Anthropic.AuthenticationError(
        401,
        { type: 'authentication_error', message: 'invalid x-api-key' },
        'invalid x-api-key',
        new Headers(),
      );
      const { client } = fakeClient(() => {
        throw authError;
      });
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateCoverLetter(profile, job, 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'auth',
      });
    });

    it('wraps a 5xx server error into a typed overloaded AiProviderError', async () => {
      const serverError = new Anthropic.InternalServerError(
        500,
        { type: 'api_error', message: 'oops' },
        'oops',
        new Headers(),
      );
      const { client } = fakeClient(() => {
        throw serverError;
      });
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateCvVariant(profile, job, 'en')).rejects.toMatchObject({
        code: 'overloaded',
      });
    });

    it('surfaces a refusal stop_reason as a typed refusal AiProviderError instead of parsing empty content', async () => {
      const { client } = fakeClient(() =>
        textMessage('', {
          content: [],
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: 'cyber', explanation: null } as never,
        }),
      );
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateCoverLetter(profile, job, 'en')).rejects.toMatchObject({
        code: 'refusal',
      });
    });

    it('does not swallow non-SDK errors thrown by the injected client', async () => {
      const { client } = fakeClient(() => {
        throw new Error('network exploded');
      });
      const provider = new AnthropicAiProvider(testMarketPack, { client });

      await expect(provider.generateMatchExplanation(profile, job, 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'api_error',
      });
    });
  });
});
