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
  /**
   * Conservative, hand-curated skill/credential alias table: lowercase alias
   * phrase -> lowercase canonical concept key. Every entry must be a true
   * spelling/abbreviation/rebrand of the SAME underlying skill (e.g. 'k8s'
   * -> 'kubernetes'), never a merely-related-but-distinct skill grouped
   * together for convenience. See market-de's skillAliases for the full
   * rationale and the boundary cases it deliberately excludes.
   */
  skillAliases: Record<string, string>;
  /**
   * Conservative, hand-curated job-title WORD alias table: lowercase alias
   * word -> lowercase canonical word, applied per-token before the Jaccard
   * word-set comparison in titleSimilarity. Even narrower than skillAliases:
   * an entry may only exist if the two words are interchangeable across
   * EVERY common job-title context, not just the field that motivated it -
   * a single overloaded word can inject a false title-token match between
   * two otherwise-unrelated jobs. See market-de's titleAliases for the full
   * rationale and the industry-collision cases it deliberately excludes
   * (e.g. 'developer' was excluded despite being an obvious tech synonym
   * for 'engineer', because 'Real Estate Developer' is a real, unrelated
   * job title).
   */
  titleAliases: Record<string, string>;
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
