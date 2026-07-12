import OpenAI from 'openai';
import type { CandidateProfile, CanonicalJob, CvVariantStyle, MarketPack } from '@german-smart-apply/shared';
import type {
  AiGenerationResult,
  AiProvider,
  CvSuggestionsResult,
  FollowUpEmailResult,
  InterviewPrepResult,
  ParseCvResult,
} from './types.js';
import { CV_VARIANT_STYLE_INSTRUCTIONS } from './types.js';
import { AiProviderError } from './errors.js';
import {
  asStringArray,
  formatJobForPrompt,
  formatProfileForPrompt,
  interpolate,
  isRecord,
  parseParsedCvInput,
} from './prompt-utils.js';

/**
 * Minimal structural surface of the OpenAI SDK client this provider needs -
 * same "inject a fake for tests" pattern as AnthropicMessagesClient. OpenRouter
 * is a drop-in OpenAI-compatible endpoint, so the official `openai` SDK works
 * unmodified pointed at OpenRouter's baseURL.
 */
export interface OpenRouterChatClient {
  chat: {
    completions: {
      create(params: OpenAI.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.ChatCompletion>;
    };
  };
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Free-tier default: openai/gpt-oss-120b:free supports native tool use and
// structured output (unlike many free models on OpenRouter's rotating
// roster), so it's a reasonable default for testing this provider's wiring
// before committing to a paid model. Override via OPENROUTER_MODEL - the
// free-model roster rotates, and this ID is not guaranteed to stay available
// forever.
const DEFAULT_MODEL = 'openai/gpt-oss-120b:free';

function toAiProviderError(err: unknown, context: string): AiProviderError {
  if (err instanceof AiProviderError) {
    return err;
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new AiProviderError(`${context}: authentication failed - ${err.message}`, 'auth', err);
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new AiProviderError(`${context}: rate limited - ${err.message}`, 'rate_limit', err);
  }
  if (err instanceof OpenAI.InternalServerError) {
    return new AiProviderError(
      `${context}: OpenRouter/model backend is temporarily unavailable - ${err.message}`,
      'overloaded',
      err,
    );
  }
  if (err instanceof OpenAI.BadRequestError || err instanceof OpenAI.UnprocessableEntityError) {
    return new AiProviderError(`${context}: invalid request - ${err.message}`, 'invalid_request', err);
  }
  if (err instanceof OpenAI.APIError) {
    return new AiProviderError(`${context}: OpenRouter API error - ${err.message}`, 'api_error', err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AiProviderError(`${context}: ${message}`, 'api_error', err);
}

/** Strips a ```json ... ``` (or bare ```...```) code fence some models wrap JSON in despite instructions not to. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text;
}

/**
 * Free models are unreliable at strict tool-calling - some ignore
 * `tool_choice` and just write JSON straight into the message content
 * instead. Unlike AnthropicAiProvider's strict "must be a tool_use block"
 * requirement, this accepts either shape and only throws malformed_response
 * when neither parses. The goal here is proving real output flows through
 * the pipe, not enforcing schema purity on a free/small model.
 */
function extractStructuredOutput(
  completion: OpenAI.ChatCompletion,
  toolName: string,
  context: string,
): unknown {
  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (c): c is OpenAI.ChatCompletionMessageFunctionToolCall => c.type === 'function' && c.function.name === toolName,
  ) ?? message?.tool_calls?.[0];
  if (toolCall && 'function' in toolCall) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      // fall through to content-based parsing below
    }
  }
  const content = message?.content;
  if (content) {
    try {
      return JSON.parse(stripCodeFence(content));
    } catch {
      // fall through to the throw below
    }
  }
  throw new AiProviderError(
    `${context}: expected a "${toolName}" tool call or a JSON object in the response, got neither ` +
      `(finish_reason=${completion.choices[0]?.finish_reason ?? 'unknown'})`,
    'malformed_response',
  );
}

function extractText(completion: OpenAI.ChatCompletion, context: string): string {
  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new AiProviderError(
      `${context}: model returned no text content (finish_reason=${completion.choices[0]?.finish_reason ?? 'unknown'})`,
      'malformed_response',
    );
  }
  return text;
}

const PARSED_CV_TOOL_NAME = 'record_parsed_cv';
const CV_SUGGESTIONS_TOOL_NAME = 'record_cv_suggestions';
const FOLLOW_UP_EMAIL_TOOL_NAME = 'record_follow_up_email';
const INTERVIEW_PREP_TOOL_NAME = 'record_interview_prep';

function buildParsedCvTool(): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: PARSED_CV_TOOL_NAME,
      description: 'Record the structured profile extracted from a candidate CV.',
      parameters: {
        type: 'object',
        properties: {
          fullName: { type: ['string', 'null'], description: "The candidate's full name, or null if unknown." },
          email: { type: ['string', 'null'], description: 'Contact email, or null if none is present.' },
          phone: { type: ['string', 'null'], description: 'Contact phone number, or null if none is present.' },
          summary: { type: 'string', description: 'A concise 2-3 sentence professional summary.' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Flat list of skills/technologies.' },
          experience: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                company: { type: 'string' },
                startDate: { type: ['string', 'null'] },
                endDate: { type: ['string', 'null'] },
                description: { type: 'string' },
              },
              required: ['title', 'company', 'startDate', 'endDate', 'description'],
            },
          },
          education: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                degree: { type: 'string' },
                institution: { type: 'string' },
                startYear: { type: ['number', 'null'] },
                endYear: { type: ['number', 'null'] },
              },
              required: ['degree', 'institution', 'startYear', 'endYear'],
            },
          },
          languages: { type: 'array', items: { type: 'string' }, description: 'Natural languages spoken.' },
          suggestions: { type: 'array', items: { type: 'string' }, description: '2-4 concrete CV suggestions.' },
        },
        required: ['fullName', 'email', 'phone', 'summary', 'skills', 'experience', 'education', 'languages', 'suggestions'],
      },
    },
  };
}

function buildCvSuggestionsTool(): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: CV_SUGGESTIONS_TOOL_NAME,
      description: 'Record the list of concrete CV improvement suggestions.',
      parameters: {
        type: 'object',
        properties: {
          suggestions: { type: 'array', items: { type: 'string' }, description: 'Concrete, actionable suggestions.' },
        },
        required: ['suggestions'],
      },
    },
  };
}

function buildFollowUpEmailTool(): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: FOLLOW_UP_EMAIL_TOOL_NAME,
      description: 'Record the drafted follow-up email.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'A short, professional email subject line.' },
          body: { type: 'string', description: 'The full email body, including greeting and sign-off.' },
        },
        required: ['subject', 'body'],
      },
    },
  };
}

function buildInterviewPrepTool(): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: INTERVIEW_PREP_TOOL_NAME,
      description: 'Record the interview preparation content.',
      parameters: {
        type: 'object',
        properties: {
          questions: { type: 'array', items: { type: 'string' }, description: '5-8 likely interview questions.' },
          talkingPoints: { type: 'array', items: { type: 'string' }, description: "3-5 talking points grounded in the candidate's background." },
        },
        required: ['questions', 'talkingPoints'],
      },
    },
  };
}

export interface OpenRouterAiProviderOptions {
  /** Injected client for tests; defaults to `new OpenAI({ apiKey, baseURL })` pointed at OpenRouter. */
  client?: OpenRouterChatClient;
  apiKey?: string;
  /** Model slug, e.g. 'openai/gpt-oss-120b:free'. Defaults to DEFAULT_MODEL - override as OpenRouter's free roster rotates. */
  model?: string;
}

/**
 * AiProvider backed by OpenRouter (openrouter.ai) - an OpenAI-compatible
 * proxy in front of 400+ models, including several free-tier ones. Intended
 * as a cheap way to validate real-model *behavior and functionality* end to
 * end before committing to Anthropic's paid API: same AiProvider contract,
 * same market-pack prompts, swapped in via createAiProvider() based on which
 * API key is present in the environment.
 */
export class OpenRouterAiProvider implements AiProvider {
  private readonly client: OpenRouterChatClient;
  private readonly marketPack: MarketPack;
  private readonly model: string;

  constructor(marketPack: MarketPack, options: OpenRouterAiProviderOptions = {}) {
    this.marketPack = marketPack;
    this.model = options.model || DEFAULT_MODEL;
    this.client =
      options.client ??
      new OpenAI({
        // Unlike Anthropic's SDK, OpenAI's throws eagerly at construction
        // time (not just on first request) when no apiKey is resolvable -
        // fall back to a placeholder so construction never fails here; an
        // actual request with no real key then surfaces as a normal 401,
        // wrapped into AiProviderError('auth') by toAiProviderError below.
        apiKey: options.apiKey ?? process.env.OPENROUTER_API_KEY ?? 'sk-or-no-key-set',
        baseURL: OPENROUTER_BASE_URL,
      });
  }

  private async createCompletion(
    params: Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, 'model'>,
    context: string,
  ): Promise<OpenAI.ChatCompletion> {
    let completion: OpenAI.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create({ model: this.model, ...params });
    } catch (err) {
      throw toAiProviderError(err, context);
    }
    const choice = completion.choices[0];
    if (choice?.finish_reason === 'content_filter' || choice?.message?.refusal) {
      const detail = choice?.message?.refusal ? ` (${choice.message.refusal})` : '';
      throw new AiProviderError(`${context}: request was declined by content-filtering${detail}`, 'refusal');
    }
    return completion;
  }

  async parseCv(rawText: string, language: string): Promise<ParseCvResult> {
    const context = 'parseCv';
    const { dateFormat } = this.marketPack.cvFormattingNorms;
    const system = [
      'You are an expert CV/resume parser for a Germany-first job search platform.',
      `Extract structured information from the candidate's CV text and call the ${PARSED_CV_TOOL_NAME} tool exactly once with the result. Do not include any other commentary.`,
      `Write the "summary" and "suggestions" fields in ${language}.`,
      `Interpret ambiguous dates using the ${dateFormat} convention used in this market.`,
      'Do not invent facts that are not present in the CV text. Use null or empty values where information is missing.',
    ].join('\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: rawText },
        ],
        tools: [buildParsedCvTool()],
        tool_choice: { type: 'function', function: { name: PARSED_CV_TOOL_NAME } },
      },
      context,
    );

    const output = extractStructuredOutput(completion, PARSED_CV_TOOL_NAME, context);
    const parsed = parseParsedCvInput(output, context);
    return { parsed, modelUsed: completion.model, tokensUsed: completion.usage?.total_tokens ?? 0 };
  }

  async generateCvSuggestions(
    profile: CandidateProfile,
    targetJob: CanonicalJob | null,
    language: string,
  ): Promise<CvSuggestionsResult> {
    const context = 'generateCvSuggestions';
    const norms = this.marketPack.cvFormattingNorms;
    const system = [
      interpolate(this.marketPack.languagePrompts.cvSummary, { language }),
      `Formatting norms for this market: prefer ~${norms.preferredLengthPages} page(s), ${
        norms.photoExpected ? 'a photo is customary' : 'no photo is expected'
      }, dates formatted as ${norms.dateFormat}.`,
      `Call the ${CV_SUGGESTIONS_TOOL_NAME} tool with 3-6 concrete, actionable suggestions for improving this CV, written in ${language}. Do not include any other commentary.`,
    ].join('\n\n');

    const userParts = [formatProfileForPrompt(profile)];
    if (targetJob) {
      userParts.push(`Target job:\n${formatJobForPrompt(targetJob)}`);
    }

    const completion = await this.createCompletion(
      {
        max_tokens: 1024,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userParts.join('\n\n') },
        ],
        tools: [buildCvSuggestionsTool()],
        tool_choice: { type: 'function', function: { name: CV_SUGGESTIONS_TOOL_NAME } },
      },
      context,
    );

    const output = extractStructuredOutput(completion, CV_SUGGESTIONS_TOOL_NAME, context);
    const suggestions = isRecord(output) ? asStringArray(output.suggestions) : [];
    if (suggestions.length === 0) {
      throw new AiProviderError(`${context}: response contained no suggestions`, 'malformed_response');
    }
    return { suggestions, modelUsed: completion.model, tokensUsed: completion.usage?.total_tokens ?? 0 };
  }

  async generateCvVariant(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const context = 'generateCvVariant';
    const norms = this.marketPack.cvFormattingNorms;
    const system = [
      interpolate(this.marketPack.languagePrompts.cvSummary, { language }),
      `Rewrite the candidate's CV as a tailored variant for the target job below, written in ${language}.`,
      `Follow this market's formatting norms: ~${norms.preferredLengthPages} page(s), ${
        norms.photoExpected ? 'include a photo placeholder' : 'no photo'
      }, dates formatted as ${norms.dateFormat}. Mirror relevant terminology from the job description where truthful.`,
      CV_VARIANT_STYLE_INSTRUCTIONS[variantStyle],
      'Return only the CV content, with no preamble or commentary.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Target job:', formatJobForPrompt(job)].join('\n\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 3072,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      context,
    );

    return {
      text: extractText(completion, context),
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  async generateCoverLetter(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const context = 'generateCoverLetter';
    const system = [
      interpolate(this.marketPack.languagePrompts.coverLetter, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      CV_VARIANT_STYLE_INSTRUCTIONS[variantStyle],
      `Preferred length: ~${this.marketPack.cvFormattingNorms.preferredLengthPages} page(s). Return only the letter text, with no preamble or commentary.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 1536,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      context,
    );

    return {
      text: extractText(completion, context),
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  async generateMatchExplanation(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult> {
    const context = 'generateMatchExplanation';
    const system = [
      interpolate(this.marketPack.languagePrompts.matchExplanation, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      'Return only the explanation (2-3 sentences), with no preamble.',
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 512,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      },
      context,
    );

    return {
      text: extractText(completion, context),
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  async generateFollowUpEmail(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    daysSinceApplied: number,
  ): Promise<FollowUpEmailResult> {
    const context = 'generateFollowUpEmail';
    const system = [
      interpolate(this.marketPack.languagePrompts.followUpEmail, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
        daysSinceApplied: String(daysSinceApplied),
      }),
      `Call the ${FOLLOW_UP_EMAIL_TOOL_NAME} tool with the result. Do not include any other commentary.`,
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 1024,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools: [buildFollowUpEmailTool()],
        tool_choice: { type: 'function', function: { name: FOLLOW_UP_EMAIL_TOOL_NAME } },
      },
      context,
    );

    const output = extractStructuredOutput(completion, FOLLOW_UP_EMAIL_TOOL_NAME, context);
    if (!isRecord(output) || typeof output.subject !== 'string' || typeof output.body !== 'string') {
      throw new AiProviderError(`${context}: response missing "subject" or "body" string field`, 'malformed_response');
    }

    return {
      subject: output.subject,
      body: output.body,
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }

  async generateInterviewPrep(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<InterviewPrepResult> {
    const context = 'generateInterviewPrep';
    const system = [
      interpolate(this.marketPack.languagePrompts.interviewPrep, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      `Call the ${INTERVIEW_PREP_TOOL_NAME} tool with the result. Do not include any other commentary.`,
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const completion = await this.createCompletion(
      {
        max_tokens: 1536,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools: [buildInterviewPrepTool()],
        tool_choice: { type: 'function', function: { name: INTERVIEW_PREP_TOOL_NAME } },
      },
      context,
    );

    const output = extractStructuredOutput(completion, INTERVIEW_PREP_TOOL_NAME, context);
    const questions = isRecord(output) ? asStringArray(output.questions) : [];
    const talkingPoints = isRecord(output) ? asStringArray(output.talkingPoints) : [];
    if (questions.length === 0 || talkingPoints.length === 0) {
      throw new AiProviderError(`${context}: response missing "questions" or "talkingPoints"`, 'malformed_response');
    }

    return {
      questions,
      talkingPoints,
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    };
  }
}
