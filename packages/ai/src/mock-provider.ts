import type { CandidateProfile, CanonicalJob, CvVariantStyle } from '@german-smart-apply/shared';
import type {
  AiGenerationResult,
  AiProvider,
  CvSuggestionsResult,
  FollowUpEmailResult,
  InterviewPrepResult,
  ParseCvResult,
} from './types.js';

/**
 * Deterministic, template-based provider used when ANTHROPIC_API_KEY is
 * absent (e.g. this sandbox) and in unit tests that assert prompt-output
 * *shape* rather than model quality. No network calls.
 */
export class MockAiProvider implements AiProvider {
  async parseCv(rawText: string, language: string): Promise<ParseCvResult> {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const emailMatch = rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const skillsLine = lines.find((l) => /skills?:/i.test(l));
    const skills = skillsLine
      ? skillsLine
          .replace(/skills?:/i, '')
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return {
      parsed: {
        fullName: lines[0] ?? null,
        email: emailMatch ? emailMatch[0] : null,
        phone: null,
        summary: lines.slice(0, 3).join(' '),
        skills,
        experience: [],
        education: [],
        languages: [language],
        suggestions: [
          'Quantify achievements with concrete metrics (%, revenue, users).',
          'Move the most relevant skills to the top third of the document.',
        ],
      },
      modelUsed: 'mock',
      tokensUsed: 0,
    };
  }

  async generateCvSuggestions(
    profile: CandidateProfile,
    targetJob: CanonicalJob | null,
    _language: string,
  ): Promise<CvSuggestionsResult> {
    const suggestions = [
      `Emphasize experience with ${profile.skills.slice(0, 3).join(', ') || 'your core skills'}.`,
    ];
    if (targetJob) {
      suggestions.push(`Mirror terminology from "${targetJob.jobTitleNormalized}" in your summary.`);
    }
    return { suggestions, modelUsed: 'mock', tokensUsed: 0 };
  }

  async generateCvVariant(
    profile: CandidateProfile,
    job: CanonicalJob,
    _language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const base = `${profile.fullName ?? 'Candidate'} - CV tailored for ${job.jobTitleNormalized} at ${job.companyNameNormalized}.\n\nSkills: ${profile.skills.join(', ')}`;
    const styled =
      variantStyle === 'concise'
        ? `${base}\n\n(concise variant: trimmed to essentials)`
        : variantStyle === 'leadership'
          ? `${base}\n\n(leadership variant: emphasizing ownership and cross-team impact)`
          : base;
    return { text: styled, modelUsed: 'mock', tokensUsed: 0 };
  }

  async generateCoverLetter(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    variantStyle: CvVariantStyle = 'standard',
  ): Promise<AiGenerationResult> {
    const greeting = language.startsWith('de') ? 'Sehr geehrte Damen und Herren,' : 'Dear Hiring Team,';
    const base = `${greeting}\n\nI am writing to apply for the ${job.jobTitleNormalized} role at ${job.companyNameNormalized}. My background in ${profile.skills.slice(0, 3).join(', ') || profile.targetRole} aligns closely with this position.\n\nBest regards,\n${profile.fullName ?? ''}`;
    const styled =
      variantStyle === 'concise'
        ? `${base}\n\n(concise variant: trimmed to essentials)`
        : variantStyle === 'leadership'
          ? `${base}\n\n(leadership variant: emphasizing ownership and cross-team impact)`
          : base;
    return { text: styled, modelUsed: 'mock', tokensUsed: 0 };
  }

  async generateMatchExplanation(
    profile: CandidateProfile,
    job: CanonicalJob,
    _language: string,
  ): Promise<AiGenerationResult> {
    const overlap = profile.skills.filter((s) =>
      job.techStackTags.some((t) => t.toLowerCase() === s.toLowerCase()),
    );
    const text = overlap.length
      ? `Strong match: you share ${overlap.length} skill(s) (${overlap.join(', ')}) with this ${job.jobTitleNormalized} role.`
      : `Potential match based on your target role "${profile.targetRole}" and seniority "${profile.seniority}".`;
    return { text, modelUsed: 'mock', tokensUsed: 0 };
  }

  async generateFollowUpEmail(
    profile: CandidateProfile,
    job: CanonicalJob,
    language: string,
    daysSinceApplied: number,
  ): Promise<FollowUpEmailResult> {
    const greeting = language.startsWith('de') ? 'Sehr geehrte Damen und Herren,' : 'Dear Hiring Team,';
    const name = profile.fullName ?? '';
    return {
      subject: `Following up: ${job.jobTitleNormalized} application`,
      body: `${greeting}\n\nI applied for the ${job.jobTitleNormalized} role at ${job.companyNameNormalized} ${daysSinceApplied} day(s) ago and wanted to reaffirm my strong interest. Could you share an update on the status of my application?\n\nBest regards,\n${name}`,
      modelUsed: 'mock',
      tokensUsed: 0,
    };
  }

  async generateInterviewPrep(
    profile: CandidateProfile,
    job: CanonicalJob,
    _language: string,
  ): Promise<InterviewPrepResult> {
    const overlap = profile.skills.filter((s) =>
      job.techStackTags.some((t) => t.toLowerCase() === s.toLowerCase()),
    );
    const questions = [
      `Why are you interested in the ${job.jobTitleNormalized} role at ${job.companyNameNormalized}?`,
      `Walk me through a time you used ${overlap[0] ?? profile.skills[0] ?? 'a relevant skill'} to solve a difficult problem.`,
      `How would you approach your first 90 days as a ${job.jobTitleNormalized}?`,
      `Tell me about a time you disagreed with a teammate or manager. How did you handle it?`,
      `What do you know about ${job.companyNameNormalized} and why do you want to work here?`,
    ];
    const talkingPoints = overlap.length
      ? overlap
          .slice(0, 3)
          .map((skill) => `Highlight your hands-on experience with ${skill}, since it directly matches this role's requirements.`)
      : [`Connect your experience toward "${profile.targetRole}" to the responsibilities of this ${job.jobTitleNormalized} role.`];
    return { questions, talkingPoints, modelUsed: 'mock', tokensUsed: 0 };
  }
}
