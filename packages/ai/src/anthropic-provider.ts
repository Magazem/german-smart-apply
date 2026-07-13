import Anthropic from '@anthropic-ai/sdk';
import type { CandidateProfile, CanonicalJob, CvVariantStyle, MarketPack } from '@german-smart-apply/shared';
import type {
  AiGenerationResult,
  AiProvider,
  CvSuggestionsResult,
  FollowUpEmailResult,
  InterviewPrepResult,
  ParseCvResult,
  RoleGapAnalysisInput,
  RoleGapAnalysisResult,
} from './types.js';
import { CV_VARIANT_STYLE_INSTRUCTIONS, MODEL_ROUTING, TASK_MODEL_TIER } from './types.js';
import { AiProviderError, type AiProviderErrorCode } from './errors.js';
import {
  asStringArray,
  formatJobForPrompt,
  formatProfileForPrompt,
  formatRoleGapAnalysisInput,
  interpolate,
  isRecord,
  parseParsedCvInput,
} from './prompt-utils.js';

export type { AiProviderErrorCode };
export { AiProviderError };

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

const PARSED_CV_TOOL_NAME = 'record_parsed_cv';
const CV_SUGGESTIONS_TOOL_NAME = 'record_cv_suggestions';
const FOLLOW_UP_EMAIL_TOOL_NAME = 'record_follow_up_email';
const INTERVIEW_PREP_TOOL_NAME = 'record_interview_prep';
const ROLE_GAP_ANALYSIS_TOOL_NAME = 'record_role_gap_analysis';

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

function buildFollowUpEmailTool(): Anthropic.Tool {
  return {
    name: FOLLOW_UP_EMAIL_TOOL_NAME,
    description: 'Record the drafted follow-up email. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'A short, professional email subject line.' },
        body: { type: 'string', description: 'The full email body, including greeting and sign-off.' },
      },
      required: ['subject', 'body'],
    },
  };
}

function buildInterviewPrepTool(): Anthropic.Tool {
  return {
    name: INTERVIEW_PREP_TOOL_NAME,
    description: 'Record the interview preparation content. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: { type: 'string' },
          description: '5-8 likely interview questions tailored to this role and company.',
        },
        talkingPoints: {
          type: 'array',
          items: { type: 'string' },
          description: "3-5 short talking points grounded in the candidate's specific background.",
        },
      },
      required: ['questions', 'talkingPoints'],
    },
  };
}

function buildRoleGapAnalysisTool(): Anthropic.Tool {
  return {
    name: ROLE_GAP_ANALYSIS_TOOL_NAME,
    description: 'Record the target-role gap analysis. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        matchingSkills: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Skills/technologies the candidate's profile already shows that genuinely overlap with what the sample postings and tag frequency request.",
        },
        missingSkills: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Skills/technologies commonly requested in the sample postings or tag frequency that the candidate profile does not show. Only list skills actually present in the provided postings/tags, never invented ones.',
        },
        suggestedLearningTopics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Concrete topics or subjects to study to close the missing-skill gaps above.',
        },
        suggestedCertifications: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Certifications relevant to closing the gap, only if genuinely well-known and relevant to the missing skills - an empty array is fine if none are clearly appropriate.',
        },
        estimatedReadinessScore: {
          type: 'number',
          description: 'An honest estimate from 0-100 of how ready the candidate is for the target role today.',
        },
        summary: {
          type: 'string',
          description: 'A short 2-4 sentence summary explaining the readiness score and the biggest gaps.',
        },
      },
      required: [
        'matchingSkills',
        'missingSkills',
        'suggestedLearningTopics',
        'suggestedCertifications',
        'estimatedReadinessScore',
        'summary',
      ],
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
      "Do not invent, exaggerate, or infer facts, employers, titles, dates, or metrics that are not present in the candidate profile provided. Rephrasing and reordering are fine; fabrication is not.",
      interpolate(this.marketPack.languagePrompts.cvSummary, { language }),
      `Rewrite the candidate's CV as a tailored variant for the target job below, written in ${language}.`,
      `Follow this market's formatting norms: ~${norms.preferredLengthPages} page(s), ${
        norms.photoExpected ? 'include a photo placeholder' : 'no photo'
      }, dates formatted as ${norms.dateFormat}. Mirror relevant terminology from the job description where truthful.`,
      "Use standard, ATS-parsable section headers exactly as commonly recognized: 'Work Experience', 'Education', 'Skills' (or the equivalent standard header in the target language) — do not invent creative or nonstandard section names.",
      "Open with a contact header (name, email, phone) using whatever contact fields are present in the candidate profile below - omit any that are missing, never invent one.",
      "Build the Work Experience and Education sections from the candidate's actual listed positions and degrees below (title, company, dates, description / degree, institution, years) - reorder, re-emphasize, and rephrase for relevance to the target job, but every employer, title, and institution named must come from that list, never invented.",
      "If no work experience or education entries are listed below, do not invent any to fill the gap - omit that section entirely rather than fabricating a placeholder position, employer, or degree. An incomplete but honest CV is always correct; a complete but fabricated one is never acceptable, no matter how well it would otherwise match the job.",
      "Where the candidate genuinely has matching experience, front-load role-relevant keywords and phrasing drawn from the job description into the corresponding bullet points — but only where it reflects real, truthful overlap with the candidate's background.",
      'Quantify achievements with concrete numbers wherever the candidate profile provides them (%, €, team size, time saved); do not fabricate numbers where none exist.',
      "Write in third person / resume-style phrasing (avoid 'I', 'my') throughout, consistent with standard CV conventions.",
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
    const { preferredLengthWords } = this.marketPack.coverLetterFormattingNorms;
    const system = [
      'Do not invent, exaggerate, or infer facts, employers, titles, dates, or metrics that are not present in the candidate profile provided. Rephrasing and reordering are fine; fabrication is not.',
      'Only reference specific past employers, projects, or achievements that appear in the candidate\'s work experience listed below. If no work experience is listed, write generally about the candidate\'s stated skills, target role, and summary instead - never invent a specific project, employer, or story to make the letter sound more concrete.',
      interpolate(this.marketPack.languagePrompts.coverLetter, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      CV_VARIANT_STYLE_INSTRUCTIONS[variantStyle],
      `Target length: approximately ${preferredLengthWords} words (roughly one page). Do not pad — a shorter, sharper letter is better than a longer, padded one. Return only the letter text, with no preamble or commentary.`,
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

  async generateFollowUpEmail(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    daysSinceApplied: number,
  ): Promise<FollowUpEmailResult> {
    const context = 'generateFollowUpEmail';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.followUpEmail];
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

    const message = await this.createMessage(
      {
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [buildFollowUpEmailTool()],
        tool_choice: { type: 'tool', name: FOLLOW_UP_EMAIL_TOOL_NAME },
      },
      context,
    );

    const toolInput = extractToolInput(message, FOLLOW_UP_EMAIL_TOOL_NAME, context);
    if (!isRecord(toolInput) || typeof toolInput.subject !== 'string' || typeof toolInput.body !== 'string') {
      throw new AiProviderError(`${context}: tool input missing "subject" or "body" string field`, 'malformed_response');
    }

    return {
      subject: toolInput.subject,
      body: toolInput.body,
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }

  async generateInterviewPrep(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
  ): Promise<InterviewPrepResult> {
    const context = 'generateInterviewPrep';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.interviewPrep];
    const system = [
      interpolate(this.marketPack.languagePrompts.interviewPrep, {
        language,
        jobTitle: job.jobTitleNormalized,
        companyName: job.companyNameNormalized,
      }),
      `Call the ${INTERVIEW_PREP_TOOL_NAME} tool with the result. Do not include any other commentary.`,
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), 'Job details:', formatJobForPrompt(job)].join('\n\n');

    const message = await this.createMessage(
      {
        model,
        max_tokens: 1536,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [buildInterviewPrepTool()],
        tool_choice: { type: 'tool', name: INTERVIEW_PREP_TOOL_NAME },
      },
      context,
    );

    const toolInput = extractToolInput(message, INTERVIEW_PREP_TOOL_NAME, context);
    const questions = isRecord(toolInput) ? asStringArray(toolInput.questions) : [];
    const talkingPoints = isRecord(toolInput) ? asStringArray(toolInput.talkingPoints) : [];
    if (questions.length === 0 || talkingPoints.length === 0) {
      throw new AiProviderError(`${context}: tool input missing "questions" or "talkingPoints"`, 'malformed_response');
    }

    return {
      questions,
      talkingPoints,
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }

  async generateRoleGapAnalysis(
    profile: CandidateProfile,
    input: RoleGapAnalysisInput,
    language: string,
  ): Promise<RoleGapAnalysisResult> {
    const context = 'generateRoleGapAnalysis';
    const model = MODEL_ROUTING[TASK_MODEL_TIER.roleGapAnalysis];
    const system = [
      'Do not invent, exaggerate, or infer skills, postings, certifications, or facts that are not present in the candidate profile, the sample postings, or the tag frequency data provided. Base every finding strictly on that data.',
      interpolate(this.marketPack.languagePrompts.roleGapAnalysis, {
        language,
        targetRole: input.targetRole,
      }),
      `Call the ${ROLE_GAP_ANALYSIS_TOOL_NAME} tool with the result, written in ${language}. Do not include any other commentary.`,
    ].join('\n\n');

    const user = [formatProfileForPrompt(profile), formatRoleGapAnalysisInput(input)].join('\n\n');

    const message = await this.createMessage(
      {
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
        tools: [buildRoleGapAnalysisTool()],
        tool_choice: { type: 'tool', name: ROLE_GAP_ANALYSIS_TOOL_NAME },
      },
      context,
    );

    const toolInput = extractToolInput(message, ROLE_GAP_ANALYSIS_TOOL_NAME, context);
    if (!isRecord(toolInput) || typeof toolInput.summary !== 'string' || typeof toolInput.estimatedReadinessScore !== 'number') {
      throw new AiProviderError(
        `${context}: tool input missing "summary" or "estimatedReadinessScore"`,
        'malformed_response',
      );
    }

    return {
      matchingSkills: asStringArray(toolInput.matchingSkills),
      missingSkills: asStringArray(toolInput.missingSkills),
      suggestedLearningTopics: asStringArray(toolInput.suggestedLearningTopics),
      suggestedCertifications: asStringArray(toolInput.suggestedCertifications),
      estimatedReadinessScore: Math.max(0, Math.min(100, toolInput.estimatedReadinessScore)),
      summary: toolInput.summary,
      modelUsed: message.model,
      tokensUsed: totalTokens(message.usage),
    };
  }
}
