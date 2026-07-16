import type { MarketPack } from '@german-smart-apply/shared';

// TODO(Phase 3 — France market pack): flesh out sources, prompts, salary parsing,
// location dictionary, scam heuristics, company aliases, and ranking weights for
// the French market. Placeholder keeps the market-pack loader interface stable
// so `market-de` needs no changes when this pack goes active.
export const marketFr: MarketPack = {
  countryCode: 'FR',
  displayName: 'France',
  status: 'planned',
  sources: [],
  languagePrompts: {
    cvSummary: '',
    coverLetter: '',
    matchExplanation: '',
    followUpEmail: '',
    interviewPrep: '',
    roleGapAnalysis: '',
  },
  cvFormattingNorms: {
    preferredLengthPages: 1,
    photoExpected: false,
    dateFormat: 'MM/YYYY',
  },
  coverLetterFormattingNorms: {
    preferredLengthWords: 350,
  },
  salaryParsing: {
    currency: 'EUR',
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },
  locationDictionary: {},
  scamHeuristics: {
    suspiciousDomainPatterns: [],
    suspiciousContactPatterns: [],
  },
  companyAliases: {},
  skillAliases: {},
  titleAliases: {},
  rankingWeights: {
    titleSimilarity: 0,
    skillOverlap: 0,
    locationFit: 0,
    recency: 0,
    salaryFit: 0,
    languageFit: 0,
    sourceTrust: 0,
    riskPenalty: 0,
  },
};

export default marketFr;
