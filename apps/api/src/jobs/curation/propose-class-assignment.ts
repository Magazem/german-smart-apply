import type { TitleEquivalenceClass } from '@german-smart-apply/shared';

/**
 * The narrow, local seam for the title-equivalence-class curation engine's
 * LLM step (Gate 2 rev B, PR2). Deliberately NOT added to
 * @german-smart-apply/ai's AiProvider interface: that interface is the
 * RUNTIME contract with three implementations (Anthropic/OpenRouter/Mock)
 * serving user-facing generation features on the request path. This
 * capability never runs on the request path - it's offline curation
 * tooling, invoked from a standalone script (see apps/api/scripts/
 * propose-title-classes.mjs) - so growing a 3-implementation runtime
 * interface for it would be a category error every future reader of that
 * interface pays for. Testability comes from taking the client as a plain
 * parameter (mockable with a fake object, no real API key or network call
 * needed for propose-class-assignment.test.ts) rather than from a shared
 * provider abstraction.
 */

const TOOL_NAME = 'propose_title_class_assignment';

/** Minimal shape this module needs from an Anthropic-compatible client - narrow on purpose, see the file comment. */
export interface AnthropicLikeClient {
  messages: {
    create(params: unknown): Promise<{
      content: Array<{ type: string; name?: string; input?: unknown }>;
    }>;
  };
}

export interface ClassAssignmentProposal {
  proposedClassId: string;
  confidence: number;
  reasoning: string;
}

/**
 * JSON-schema tool-use definition, mirroring @german-smart-apply/ai's
 * generateRoleGapAnalysis pattern (buildRoleGapAnalysisTool in
 * anthropic-provider.ts) - a forced tool_choice call, not free text, so the
 * result is a typed object or a loud failure, never a hopeful text-parse.
 */
export function buildProposalTool(classes: TitleEquivalenceClass[]) {
  const classIds = [...classes.map((c) => c.id), 'none'];
  return {
    name: TOOL_NAME,
    description: 'Record whether a real-world job/candidate title names the SAME occupation as one of the known title-equivalence classes. Call this exactly once.',
    input_schema: {
      type: 'object',
      properties: {
        proposedClassId: {
          type: 'string',
          enum: classIds,
          description: 'The id of the existing class this title names the same occupation as, or "none" if it does not clearly match any of them.',
        },
        confidence: {
          type: 'number',
          description: '0 (not confident at all) to 1 (certain) that this is the SAME occupation as the proposed class - not merely related, not a broader/narrower scope, and not a different seniority level.',
        },
        reasoning: {
          type: 'string',
          description: 'One or two sentences explaining the classification, in the same style as this project\'s existing audit trail comments.',
        },
      },
      required: ['proposedClassId', 'confidence', 'reasoning'],
    },
  };
}

/**
 * Same classification task as buildProposalTool, in OpenAI/OpenRouter's
 * ChatCompletionTool shape ({ type: 'function', function: {...} }) instead
 * of Anthropic's ({ name, description, input_schema }) - the two APIs
 * disagree on tool-schema envelope, not on JSON Schema itself, so the
 * `parameters`/`input_schema` body is identical between the two builders.
 */
export function buildOpenRouterProposalTool(classes: TitleEquivalenceClass[]) {
  const anthropicShape = buildProposalTool(classes);
  return {
    type: 'function' as const,
    function: {
      name: anthropicShape.name,
      description: anthropicShape.description,
      parameters: anthropicShape.input_schema,
    },
  };
}

/** Minimal shape this module needs from an OpenAI-compatible client (OpenRouter is a drop-in OpenAI endpoint) - narrow on purpose, see the file comment. */
export interface OpenAiLikeClient {
  chat: {
    completions: {
      create(params: unknown): Promise<{
        choices: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{ type: string; function?: { name: string; arguments: string } }>;
          };
          finish_reason?: string;
        }>;
      }>;
    };
  };
}

/** Strips a ```json ... ``` (or bare ```...```) code fence some models wrap JSON in despite instructions not to - mirrors openrouter-provider.ts's stripCodeFence. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text;
}

/**
 * Calls the given OpenAI-compatible client (OpenRouter) once to classify
 * one candidate title against the known classes. Unlike
 * proposeClassAssignment's strict Anthropic path, this accepts either a
 * real tool_calls entry or a bare JSON object in the message content -
 * mirrors @german-smart-apply/ai's openrouter-provider.ts
 * extractStructuredOutput, since free/small OpenRouter models are
 * unreliable at strict tool_choice compliance. Still throws loudly if
 * neither shape parses - a missed classification is safe, a silently wrong
 * one is not.
 */
export async function proposeClassAssignmentViaOpenRouter(
  client: OpenAiLikeClient,
  candidateTitle: string,
  classes: TitleEquivalenceClass[],
  model: string,
): Promise<ClassAssignmentProposal> {
  const tool = buildOpenRouterProposalTool(classes);
  const completion = await client.chat.completions.create({
    model,
    max_tokens: 512,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(candidateTitle, classes) },
    ],
    tools: [tool],
    tool_choice: { type: 'function', function: { name: TOOL_NAME } },
  });

  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.find((c) => c.type === 'function' && c.function?.name === TOOL_NAME) ?? message?.tool_calls?.[0];
  if (toolCall?.function) {
    try {
      return JSON.parse(toolCall.function.arguments) as ClassAssignmentProposal;
    } catch {
      // fall through to content-based parsing below
    }
  }
  if (message?.content) {
    try {
      return JSON.parse(stripCodeFence(message.content)) as ClassAssignmentProposal;
    } catch {
      // fall through to the throw below
    }
  }
  throw new Error(
    `propose-class-assignment (OpenRouter): expected a "${TOOL_NAME}" tool call or a JSON object in the response for "${candidateTitle}", got neither (finish_reason=${completion.choices[0]?.finish_reason ?? 'unknown'})`,
  );
}

function buildSystemPrompt(): string {
  return [
    'You classify real-world job and candidate-profile titles against a small, curated set of "title-equivalence classes" - groups of titles that all name the exact SAME occupation, just phrased differently (e.g. "Software Engineer" and "Full-Stack Developer").',
    '',
    'Only propose a match when it is genuinely the same occupation. Do NOT propose a match for:',
    '- A broader or narrower specialization within the same field (e.g. a general compliance role vs. a specific SOC2 compliance role).',
    '- A different seniority or scope level (e.g. an individual-contributor role vs. its department-leadership counterpart).',
    '- A title that merely shares a word or acronym with a class member but names a different field entirely (e.g. "Developer" appears in both software engineering and real-estate development).',
    '',
    'If genuinely unsure, or if the title does not clearly match any class, propose "none" rather than guessing - a missed classification is safe (it just stays unclassified for now); a wrong one is not.',
  ].join('\n');
}

function buildUserPrompt(candidateTitle: string, classes: TitleEquivalenceClass[]): string {
  const classSummaries = classes.map((c) => ({ id: c.id, members: c.members }));
  return [
    `Candidate title: "${candidateTitle}"`,
    '',
    'Known title-equivalence classes:',
    JSON.stringify(classSummaries, null, 2),
    '',
    'Does this title name the same occupation as one of these classes?',
  ].join('\n');
}

/**
 * Calls the given Anthropic-compatible client once, with a forced tool
 * call, to classify one candidate title against the known classes. Throws
 * if the model doesn't return the expected tool_use block - fail loud, not
 * a silent guess.
 */
export async function proposeClassAssignment(
  client: AnthropicLikeClient,
  candidateTitle: string,
  classes: TitleEquivalenceClass[],
  model: string,
): Promise<ClassAssignmentProposal> {
  const tool = buildProposalTool(classes);
  const message = await client.messages.create({
    model,
    max_tokens: 512,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(candidateTitle, classes) }],
    tools: [tool],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use' && block.name === TOOL_NAME);
  if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
    throw new Error(`propose-class-assignment: model did not return the expected "${TOOL_NAME}" tool_use block for "${candidateTitle}"`);
  }
  return toolUse.input as ClassAssignmentProposal;
}
