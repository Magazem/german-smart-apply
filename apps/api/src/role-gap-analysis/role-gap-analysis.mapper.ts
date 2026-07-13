import type { RoleGapAnalysis as PrismaRoleGapAnalysis } from '@german-smart-apply/db';
import type { RoleGapAnalysis } from '@german-smart-apply/shared';

export function toSharedRoleGapAnalysis(record: PrismaRoleGapAnalysis): RoleGapAnalysis {
  return {
    id: record.id,
    userId: record.userId,
    targetRole: record.targetRole,
    matchingSkills: record.matchingSkills,
    missingSkills: record.missingSkills,
    suggestedLearningTopics: record.suggestedLearningTopics,
    suggestedCertifications: record.suggestedCertifications,
    estimatedReadinessScore: record.estimatedReadinessScore,
    summary: record.summary,
    sampleJobCount: record.sampleJobCount,
    modelUsed: record.modelUsed,
    tokensUsed: record.tokensUsed,
    createdAt: record.createdAt.toISOString(),
  };
}
