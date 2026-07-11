import Anthropic from '@anthropic-ai/sdk';
import type {
  CandidateProfile,
  CanonicalJob,
  CvVariantStyle,
  MarketPack,
  ParsedCvEducation,
  ParsedCvExperience,
  ParsedCvResult,
} from '@german-smart-apply/shared';
import type { AiGenerationResult, AiProvider, CvSuggestionsResult, ParseCvResult } from './types.js';
import { CV_VARIANT_STYLE_INSTRUCTIONS, MODEL_ROUTING, TASK_MODEL_TIER } from './types.js';

/**
 * Minimal structural surface of the Anthropic SDK client this provider
 * needs. Defined separately from the full `Anthropic` class so tests can
 * inject a fake client that never touches the network - any object shaped
 * like this (including a real `new Anthropic()` instance) satisfies it.
 */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export type AiProviderErrorCode =
  | 'auth'
  | 'rate_limit'
  | 'overloaded'
  | 'invalid_request'
  | 'refusal'
  | 'malformed_response'
  | 'api_error';

/**
 * Typed error thrown by AnthropicAiProvider instead of silently returning
 * empty data. Callers can branch on `.code` to decide whether to retry
 * (rate_limit/overloaded/api_error), surface a config problem (auth), or
 * treat it as a content outcome (refusal/invalid_request/malformed_response).
 */
export class AiProviderError extends Error {
  readonly code: AiProviderErrorCode;
  override readonly cause?: unknown;

  constructor(message: string, code: AiProviderErrorCode, cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
    this.code = code;
    this.cause = cause;
  }
}

function toAiProviderError(err: unknown, context: string): AiProviderError {
  if (err instanceof AiProviderError) {
    return err;
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiProviderError(`${context}: authentication failed - ${err.message}`, 'auth', err);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiProviderError(`${context}: rate limited - ${err.message}`, 'rate_limit', err);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new AiProviderError(
      `${context}: Anthropic API is temporarily unavailable - ${err.message}`,
      'overloaded',
      err,
    );
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.UnprocessableEntityError) {
    return new AiProviderError(`${context}: invalid request - ${err.message}`, 'invalid_request', err);
  }
  if (err instanceof Anthropic.APIError) {
    return new AiProviderError(`${context}: Anthropic API error - ${err.message}`, 'api_error', err);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AiProviderError(`${context}: ${message}`, 'api_error', err);
}

function totalTokens(usage: Anthropic.Usage): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toParsedCvExperience(value: unknown): ParsedCvExperience[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    title: typeof item.title === 'string' ? item.title : '',
    company: typeof item.company === 'string' ? item.company : '',
    startDate: asStringOrNull(item.startDate),
    endDate: asStringOrNull(item.endDate),
    description: typeof item.description === 'string' ? item.description : '',
  }));
}

function toParsedCvEducation(value: unknown): ParsedCvEducation[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    degree: typeof item.degree === 'string' ? item.degree : '',
    institution: typeof item.institution === 'string' ? item.institution : '',
    startYear: typeof item.startYear === 'number' ? item.startYear : null,
    endYear: typeof item.endYear === 'number' ? item.endYear : null,
  }));
}

function parseParsedCvInput(input: unknown, context: string): ParsedCvResult {
  if (!isRecord(input)) {
    throw new AiProviderError(`${context}: tool input was not a JSON object`, 'malformed_response');
  }
  if (typeof input.summary !== 'string') {
    throw new AiProviderError(
      `${context}: tool input is missing the required "summary" string field`,
      'malformed_response',
    );
  }
  return {
    fullName: asStringOrNull(input.fullName),
    email: asStringOrNull(input.email),
    phone: asStringOrNull(input.phone),
    summary: input.summary,
    skills: asStringArray(input.skills),
    experience: toParsedCvExperience(input.experience),
    education: toParsedCvEducation(input.education),
    languages: asStringArray(input.languages),
    suggestions: asStringArray(input.suggestions),
  };
}

const PARSED_CV_TOOL_NAME = 'record_parsed_cv';
const CV_SUGGESTIONS_TOOL_NAME = 'record_cv_suggestions';

function buildParsedCvTool(): Anthropic.Tool {
  return {
    name: PARSED_CV_TOOL_NAME,
    description: 'Record the structured profile extracted from a candidate CV. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        fullName: {
          type: ['string', 'null'],
          description: "The candidate's full name, or null if it cannot be determined.",
        },
        email: { type: ['string', 'null'], description: 'Contact email address, or null if none is present.' },
        phone: { type: ['string', 'null'], description: 'Contact phone number, or null if none is present.' },
        summary: {
          type: 'string',
          description: 'A concise 2-3 sentence professional summary of the candidate.',
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Flat list of skills and technologies mentioned in the CV.',
        },
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
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Natural languages the candidate speaks.',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 concrete, actionable suggestions for improving this CV.',
        },
      },
      required: ['fullName', 'email', 'phone', 'summary', 'skills', 'experience', 'education', 'languages', 'suggestions'],
    },
  };
}

function buildCvSuggestionsTool(): Anthropic.Tool {
  return {
    name: CV_SUGGESTIONS_TOOL_NAME,
    description: 'Record the list of concrete CV improvement suggestions. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Each entry is one concrete, actionable suggestion for improving the CV.',
        },
      },
      required: ['suggestions'],
    },
  };
}

function extractToolInput(message: Anthropic.Message, toolName: string, context: string): unknown {
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName,
  );
  if (!block) {
    throw new AiProviderError(
      `${context}: expected a "${toolName}" tool call but got stop_reason=${message.stop_reason ?? 'unknown'}`,
      'malformed_response',
    );
  }
  return block.input;
}

function extractText(message: Anthropic.Message, context: string): string {
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) {
    throw new AiProviderError(
      `${context}: model returned no text content (stop_reason=${message.stop_reason ?? 'unknown'})`,
      'malformed_response',
    );
  }
  return text;
}

function formatProfileForPrompt(profile: CandidateProfile): string {
  const lines = [
    `Target role: ${profile.targetRole}`,
    `Seniority: ${profile.seniority}`,
    `Location preference: ${profile.locationPreference}`,
    `Skills: ${profile.skills.join(', ') || 'none listed'}`,
  ];
  if (profile.summary) lines.push(`Current summary: ${profile.summary}`);
  if (profile.fullName) lines.unshift(`Candidate name: ${profile.fullName}`);
  return lines.join('\n');
}

function formatJobForPrompt(job: CanonicalJob): string {
  return [
    `Job title: ${job.jobTitleNormalized}`,
    `Company: ${job.companyNameNormalized}`,
    `Location: ${job.locationNormalized} (${job.remoteType})`,
    `Seniority: ${job.seniority ?? 'unspecified'}`,
    `Tech stack: ${job.techStackTags.join(', ') || 'not specified'}`,
    `Description: ${job.jobDescriptionText}`,
  ].join('\n');
}

export interface AnthropicAiProviderOptions {
  /** Injected client for tests; defaults to `new Anthropic()` (reads ANTHROPIC_API_KEY). */
  client?: AnthropicMessagesClient;
  apiKey?: string;
}

/**
 * Real AiProvider backed by the Anthropic API. Not Germany-hardcoded: the
 * market pack (prompts, CV formatting norms) is injected at construction
 * time, so a future market-fr pack can reuse this class unchanged.
 */
export class AnthropicAiProvider implements AiProvider {
  private readonly client: AnthropicMessagesClient;
  private readonly marketPack: MarketPack;

  constructor(marketPack: MarketPack, options: AnthropicAiProviderOptions = {}) {
    this.marketPack = marketPack;
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  private async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
    context: string,
  ): Promise<Anthropic.Message> {
    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create(params);
    } catch (err) {
      throw toAiProviderError(err, context);
    }
    if (message.stop_reason === 'refusal') {
      const details = message.stop_details ? ` (${JSON.stringify(message.stop_details)})` : '';
      throw new AiProviderError(
        `${context}: request was declined by Anthropic's safety classifiers${details}`,
        'refusal',
      );
    }
    return message;
  }

  async parseCv(rawText: string, language: string): Promise<ParseCvResult> {
    const context = 'parseCv';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.parseCv];
    const { dateFormat } = this.marketPack.cvFormattingNorms;
    const system = [
      'You are an expert CV/resume parser for a Germany-first job search platform.',
      `Extract structured information from the candidate's CV text and call the ${PARSED_CV_TOOL_NAME} tool exactly once with the result. Do not include any other commentary.`,
      `Write the "summary" and "suggestions" fields in ${language}.`,
      `Interpret ambiguous dates using the ${dateFormat} convention used in this market.`,
      'Do not invent facts that are not present in the CV text. Use null or empty values where information is missing.',
    ].join('\n');

    const message = await this.createMessage(
      {
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: rawText }],
        tools: [buildParsedCvTool()],
        tool_choice: { type: 'tool', name: PARSED_CV_TOOL_NAME },
      },
      context,
    );

    const toolInput = extractToolInput(message, PARSED_CV_TOOL_NAME, context);
    const parsed = parseParsedCvInput(toolInput, context);
    return { parsed, modelUsed: message.model, tokensUsed: totalTokens(message.usage) };
  }

  async generateCvSuggestions(
    profile: CandidateProfile,
    targetJob: CanonicalJob | null,
    language: string,
  ): Promise<CvSuggestionsResult> {
    const context = 'generateCvSuggestions';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.cvSuggestions];
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

    const message = await this.createMessage(
      {
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userParts.join('\n\n') }],
        tools: [buildCvSuggestionsTool()],
        tool_choice: { type: 'tool', name: CV_SUGGESTIONS_TOOL_NAME },
      },
      context,
    );

    const toolInput = extractToolInput(message, CV_SUGGESTIONS_TOOL_NAME, context);
    const suggestions = isRecord(toolInput) ? asStringArray(toolInput.suggestions) : [];
    if (suggestions.length === 0) {
      throw new AiProviderError(`${context}: tool input contained no suggestions`, 'malformed_response');
    }

    return { suggestions, modelUsed: message.model, tokensUsed: totalTokens(message.usage) };
  }

  async generateCvVariant(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const context = 'generateCvVariant';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.cvVariant];
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

    const message = await this.createMessage(
      { model, max_tokens: 3072, system, messages: [{ role: 'user', content: user }] },
      context,
    );

    return {
      text: extractText(message, context),
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }

  async generateCoverLetter(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const context = 'generateCoverLetter';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.coverLetter];
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

    const message = await this.createMessage(
      { model, max_tokens: 1536, system, messages: [{ role: 'user', content: user }] },
      context,
    );

    return {
      text: extractText(message, context),
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }

  async generateMatchExplanation(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<AiGenerationResult> {
    const context = 'generateMatchExplanation';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.matchExplanation];
    const system = [
      interpolate(this.marketPack.languagePrompts.matchExplanation, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      'Return only the explanation (2-3 sentences), with no preamble.',
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const message = await this.createMessage(
      { model, max_tokens: 512, system, messages: [{ role: 'user', content: user }] },
      context,
    );

    return {
      text: extractText(message, context),
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }
}
