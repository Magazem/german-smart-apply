import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateProfile, CanonicalJob, MarketPack } from '@german-smart-apply/shared';
import { AiProviderError } from './errors.js';
import { OpenRouterAiProvider, type OpenRouterChatClient } from './openrouter-provider.js';

const profile: CandidateProfile = {
  id: 'p1',
  userId: 'u1',
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+49 151 1234567',
  targetRole: 'Backend Engineer',
  targetCountryCode: 'DE',
  preferredLanguage: 'en',
  seniority: 'senior',
  locationPreference: 'hybrid',
  skills: ['TypeScript', 'PostgreSQL', 'Kubernetes'],
  summary: null,
  experience: [
    {
      title: 'Backend Engineer',
      company: 'Acme GmbH',
      startDate: '2021-01',
      endDate: null,
      description: 'Own the payments API.',
    },
  ],
  education: [{ degree: 'B.Sc. Computer Science', institution: 'TU Berlin', startYear: 2015, endYear: 2019 }],
  languages: ['en', 'de'],
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
  duplicateConfidence: 1,
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
    followUpEmail: 'Write a follow-up email in {{language}} for {{jobTitle}} at {{companyName}}, {{daysSinceApplied}} days since applying.',
    interviewPrep: 'Prepare the candidate in {{language}} for an interview for {{jobTitle}} at {{companyName}}.',
    roleGapAnalysis: 'Analyze in {{language}} the gap for {{targetRole}}.',
  },
  cvFormattingNorms: { preferredLengthPages: 2, photoExpected: false, dateFormat: 'MM/YYYY' },
  coverLetterFormattingNorms: { preferredLengthWords: 380 },
  salaryParsing: { currency: 'EUR', thousandsSeparator: '.', decimalSeparator: ',' },
  locationDictionary: {},
  scamHeuristics: { suspiciousDomainPatterns: [], suspiciousContactPatterns: [] },
  companyAliases: {},
  skillAliases: {},
  titleAliases: {},
  titleEquivalenceClasses: [],
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

function textCompletion(
  content: string,
  overrides: Partial<OpenAI.ChatCompletion> & { finish_reason?: OpenAI.ChatCompletion.Choice['finish_reason'] } = {},
): OpenAI.ChatCompletion {
  const { finish_reason, ...rest } = overrides;
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 0,
    model: 'openai/gpt-oss-120b:free',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, refusal: null } as OpenAI.ChatCompletionMessage,
        finish_reason: finish_reason ?? 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...rest,
  };
}

function toolCallCompletion(
  toolName: string,
  args: unknown,
  overrides: Partial<OpenAI.ChatCompletion> = {},
): OpenAI.ChatCompletion {
  return {
    id: 'chatcmpl_test_tool',
    object: 'chat.completion',
    created: 0,
    model: 'openai/gpt-oss-120b:free',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          refusal: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        } as OpenAI.ChatCompletionMessage,
        finish_reason: 'tool_calls',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
    ...overrides,
  };
}

/** Fake client: records every call and returns whatever `handler` produces. */
function fakeClient(
  handler: (params: OpenAI.ChatCompletionCreateParamsNonStreaming) => OpenAI.ChatCompletion | Promise<OpenAI.ChatCompletion>,
): { client: OpenRouterChatClient; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn(async (params: OpenAI.ChatCompletionCreateParamsNonStreaming) => handler(params));
  return { client: { chat: { completions: { create } } }, create };
}

describe('OpenRouterAiProvider', () => {
  describe('parseCv', () => {
    it('parses a tool-call response and routes to the configured model', async () => {
      const parsedInput = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: null,
        summary: 'Experienced backend engineer.',
        skills: ['TypeScript', 'PostgreSQL'],
        experience: [{ title: 'Engineer', company: 'Acme', startDate: '01/2020', endDate: null, description: 'Built things.' }],
        education: [{ degree: 'BSc CS', institution: 'TU Berlin', startYear: 2016, endYear: 2020 }],
        languages: ['en', 'de'],
        suggestions: ['Add metrics.'],
      };
      const { client, create } = fakeClient(() => toolCallCompletion('record_parsed_cv', parsedInput));
      const provider = new OpenRouterAiProvider(testMarketPack, { client, model: 'test/model:free' });

      const result = await provider.parseCv('Jane Doe\njane@example.com', 'en');

      expect(create).toHaveBeenCalledTimes(1);
      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(params.model).toBe('test/model:free');
      expect(params.tool_choice).toEqual({ type: 'function', function: { name: 'record_parsed_cv' } });

      expect(result.parsed).toEqual(parsedInput);
      expect(result.modelUsed).toBe('openai/gpt-oss-120b:free');
      expect(result.tokensUsed).toBe(180);
    });

    it('leniently accepts JSON written directly into message content instead of a tool call', async () => {
      const parsedInput = {
        fullName: 'Jane Doe',
        email: null,
        phone: null,
        summary: 'Backend engineer.',
        skills: [],
        experience: [],
        education: [],
        languages: [],
        suggestions: [],
      };
      // A free model that ignores tool_choice and just writes JSON as text.
      const { client } = fakeClient(() => textCompletion(JSON.stringify(parsedInput)));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.parseCv('Jane Doe', 'en');
      expect(result.parsed.fullName).toBe('Jane Doe');
    });

    it('strips a markdown code fence around JSON in message content', async () => {
      const parsedInput = { fullName: null, email: null, phone: null, summary: 'x', skills: [], experience: [], education: [], languages: [], suggestions: [] };
      const { client } = fakeClient(() => textCompletion('```json\n' + JSON.stringify(parsedInput) + '\n```'));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.parseCv('cv text', 'en');
      expect(result.parsed.summary).toBe('x');
    });

    it('throws malformed_response when neither a tool call nor parseable JSON is present', async () => {
      const { client } = fakeClient(() => textCompletion('Sure, here is some prose about the CV.'));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.parseCv('cv text', 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'malformed_response',
      });
    });

    it('throws malformed_response when the tool input is missing required fields', async () => {
      const { client } = fakeClient(() => toolCallCompletion('record_parsed_cv', { fullName: 'Jane Doe' }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.parseCv('cv text', 'en')).rejects.toMatchObject({ code: 'malformed_response' });
    });
  });

  describe('generateCvSuggestions', () => {
    it('routes model and interpolates the market prompt', async () => {
      const { client, create } = fakeClient(() =>
        toolCallCompletion('record_cv_suggestions', { suggestions: ['Quantify your impact.'] }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateCvSuggestions(profile, job, 'de');

      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(JSON.stringify(params.messages)).toContain('Summarize this CV in de.');
      expect(result.suggestions).toEqual(['Quantify your impact.']);
    });

    it('throws malformed_response when the response contains no suggestions', async () => {
      const { client } = fakeClient(() => toolCallCompletion('record_cv_suggestions', { suggestions: [] }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateCvSuggestions(profile, null, 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateCvVariant / generateCoverLetter / generateMatchExplanation', () => {
    it('extracts plain text content and sums usage.total_tokens', async () => {
      const { client } = fakeClient(() => textCompletion('Jane Doe - Senior Backend Engineer CV'));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateCvVariant(profile, job, 'en');
      expect(result.text).toBe('Jane Doe - Senior Backend Engineer CV');
      expect(result.tokensUsed).toBe(150);
    });

    it('throws malformed_response when the model returns no text content', async () => {
      const { client } = fakeClient(() => textCompletion('', { choices: [{ index: 0, message: { role: 'assistant', content: '', refusal: null } as OpenAI.ChatCompletionMessage, finish_reason: 'stop', logprobs: null }] }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateCoverLetter(profile, job, 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });

    it('interpolates job/company into the cover letter prompt', async () => {
      const { client, create } = fakeClient(() => textCompletion('Sehr geehrte Damen und Herren, ...'));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateCoverLetter(profile, job, 'de');
      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(JSON.stringify(params.messages)).toContain('Write a cover letter in de for senior backend engineer at acme gmbh.');
      expect(result.text).toContain('Sehr geehrte');
    });

    it('interpolates the match-explanation prompt', async () => {
      const { client } = fakeClient(() => textCompletion('Strong match on TypeScript and PostgreSQL.'));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text).toBe('Strong match on TypeScript and PostgreSQL.');
    });

    it('passes a clean response through completely unchanged', async () => {
      const clean = 'Strong match on TypeScript and PostgreSQL, with 4 years of hands-on backend experience.';
      const { client } = fakeClient(() => textCompletion(clean));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text).toBe(clean);
    });

    it('reduces a harmony-channel-wrapped response to just the final-channel content', async () => {
      const leaked =
        '<|start|>assistant<|channel|>analysis<|message|>The user asked us to explain the match; ' +
        'let me think about the overlap in skills.<|end|>' +
        '<|start|>assistant<|channel|>final<|message|>Strong match on TypeScript and PostgreSQL.<|end|>';
      const { client } = fakeClient(() => textCompletion(leaked));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text).toBe('Strong match on TypeScript and PostgreSQL.');
    });

    it('strips a <think>...</think> block and returns only the remainder', async () => {
      const wrapped =
        '<think>\nThe user asked us to explain the match. Let me consider the skill overlap.\n</think>\n' +
        'Strong match on TypeScript and PostgreSQL.';
      const { client } = fakeClient(() => textCompletion(wrapped));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateMatchExplanation(profile, job, 'en');
      expect(result.text).toBe('Strong match on TypeScript and PostgreSQL.');
    });
  });

  describe('estimateMatchScoreBlind (TEMPORARY diagnostic, see match-score-estimate.ts)', () => {
    it('forces the dimension-estimate tool and combines the result with the market pack weights', async () => {
      const { client, create } = fakeClient(() =>
        toolCallCompletion('record_match_score_estimate', {
          titleSimilarity: 0.8,
          skillOverlap: 0.6,
          locationFit: 0.7,
          languageFit: 1,
          salaryFit: 0.5,
        }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.estimateMatchScoreBlind(profile, job);

      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(params.tool_choice).toEqual({ type: 'function', function: { name: 'record_match_score_estimate' } });
      // Same fixtures/weights as anthropic-provider.test.ts's equivalent case: 64%.
      expect(result.percentage).toBe(64);
      expect(result.tokensUsed).toBe(180);
    });

    it('throws malformed_response when the tool input is missing a dimension', async () => {
      const { client } = fakeClient(() => toolCallCompletion('record_match_score_estimate', { titleSimilarity: 0.8 }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.estimateMatchScoreBlind(profile, job)).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateFollowUpEmail', () => {
    it('interpolates days-since-applied and forces the tool', async () => {
      const { client, create } = fakeClient(() =>
        toolCallCompletion('record_follow_up_email', { subject: 'Following up', body: 'Sehr geehrte Damen und Herren, ...' }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateFollowUpEmail(profile, job, 'de', 14);

      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(JSON.stringify(params.messages)).toContain(
        'Write a follow-up email in de for senior backend engineer at acme gmbh, 14 days since applying.',
      );
      expect(params.tool_choice).toEqual({ type: 'function', function: { name: 'record_follow_up_email' } });
      expect(result.subject).toBe('Following up');
      expect(result.body).toContain('Sehr geehrte');
    });

    it('throws malformed_response when subject or body is missing', async () => {
      const { client } = fakeClient(() => toolCallCompletion('record_follow_up_email', { subject: 'Hi' }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateFollowUpEmail(profile, job, 'en', 7)).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateInterviewPrep', () => {
    it('returns questions and talking points from a tool call', async () => {
      const { client } = fakeClient(() =>
        toolCallCompletion('record_interview_prep', {
          questions: ['Why this role?'],
          talkingPoints: ['Emphasize TypeScript experience.'],
        }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateInterviewPrep(profile, job, 'en');
      expect(result.questions).toEqual(['Why this role?']);
      expect(result.talkingPoints).toEqual(['Emphasize TypeScript experience.']);
    });

    it('throws malformed_response when questions or talkingPoints is missing', async () => {
      const { client } = fakeClient(() => toolCallCompletion('record_interview_prep', { questions: ['Why?'] }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateInterviewPrep(profile, job, 'en')).rejects.toMatchObject({
        code: 'malformed_response',
      });
    });
  });

  describe('generateRoleGapAnalysis', () => {
    it('returns a structured gap analysis from a tool call', async () => {
      const { client, create } = fakeClient(() =>
        toolCallCompletion('record_role_gap_analysis', {
          matchingSkills: ['TypeScript'],
          missingSkills: ['Kafka'],
          suggestedLearningTopics: ['Learn Kafka basics.'],
          suggestedCertifications: [],
          estimatedReadinessScore: 65,
          summary: 'Solid match, missing Kafka.',
        }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      const result = await provider.generateRoleGapAnalysis(
        profile,
        { targetRole: 'Backend Engineer', sampleJobs: [job], tagFrequency: { TypeScript: 3, Kafka: 2 } },
        'en',
      );

      const params = create.mock.calls[0][0] as OpenAI.ChatCompletionCreateParamsNonStreaming;
      expect(params.tool_choice).toEqual({ type: 'function', function: { name: 'record_role_gap_analysis' } });
      expect(result.matchingSkills).toEqual(['TypeScript']);
      expect(result.missingSkills).toEqual(['Kafka']);
      expect(result.estimatedReadinessScore).toBe(65);
      expect(result.summary).toContain('Kafka');
    });

    it('throws malformed_response when summary or estimatedReadinessScore is missing', async () => {
      const { client } = fakeClient(() =>
        toolCallCompletion('record_role_gap_analysis', { matchingSkills: [] }),
      );
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(
        provider.generateRoleGapAnalysis(
          profile,
          { targetRole: 'Backend Engineer', sampleJobs: [], tagFrequency: {} },
          'en',
        ),
      ).rejects.toMatchObject({ code: 'malformed_response' });
    });
  });

  describe('error handling', () => {
    it('treats a content_filter finish_reason as a typed refusal error', async () => {
      const { client } = fakeClient(() => textCompletion('', { choices: [{ index: 0, message: { role: 'assistant', content: null, refusal: 'blocked content' } as OpenAI.ChatCompletionMessage, finish_reason: 'content_filter', logprobs: null }] }));
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateCoverLetter(profile, job, 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'refusal',
      });
    });

    it('does not swallow non-SDK errors thrown by the injected client', async () => {
      const { client } = fakeClient(() => {
        throw new Error('network exploded');
      });
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateMatchExplanation(profile, job, 'en')).rejects.toMatchObject({
        name: 'AiProviderError',
        code: 'api_error',
      });
    });

    it('passes through an already-typed AiProviderError unchanged', async () => {
      const original = new AiProviderError('boom', 'invalid_request');
      const { client } = fakeClient(() => {
        throw original;
      });
      const provider = new OpenRouterAiProvider(testMarketPack, { client });

      await expect(provider.generateMatchExplanation(profile, job, 'en')).rejects.toBe(original);
    });
  });
});
