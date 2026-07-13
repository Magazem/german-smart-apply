export interface MarketPackSourceConfig {
  sourceId: string;
  sourceType: string;
  displayName: string;
  trustTier: 'high' | 'medium' | 'low';
  crawlFrequencyMinutes: number;
  config: Record<string, unknown>;
}

export interface MarketPack {
  countryCode: string;
  displayName: string;
  status: 'active' | 'planned';
  sources: MarketPackSourceConfig[];
  languagePrompts: {
    cvSummary: string;
    coverLetter: string;
    matchExplanation: string;
    followUpEmail: string;
    interviewPrep: string;
    roleGapAnalysis: string;
  };
  cvFormattingNorms: {
    preferredLengthPages: number;
    photoExpected: boolean;
    dateFormat: string;
  };
  coverLetterFormattingNorms: {
    preferredLengthWords: number;
  };
  salaryParsing: {
    currency: string;
    thousandsSeparator: '.' | ',';
    decimalSeparator: '.' | ',';
  };
  locationDictionary: Record<string, string>;
  scamHeuristics: {
    suspiciousDomainPatterns: string[];
    suspiciousContactPatterns: string[];
  };
  companyAliases: Record<string, string[]>;
  rankingWeights: {
    titleSimilarity: number;
    skillOverlap: number;
    locationFit: number;
    recency: number;
    salaryFit: number;
    languageFit: number;
    sourceTrust: number;
    riskPenalty: number;
  };
}
