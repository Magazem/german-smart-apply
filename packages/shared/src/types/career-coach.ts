export interface RoleGapAnalysis {
  id: string;
  userId: string;
  targetRole: string;
  matchingSkills: string[];
  missingSkills: string[];
  suggestedLearningTopics: string[];
  suggestedCertifications: string[];
  estimatedReadinessScore: number;
  summary: string;
  sampleJobCount: number;
  modelUsed: string;
  tokensUsed: number;
  createdAt: string;
}
