export interface MarketPackSourceConfig {
  sourceId: string;
  sourceType: string;
  displayName: string;
  trustTier: 'high' | 'medium' | 'low';
  crawlFrequencyMinutes: number;
  config: Record<string, unknown>;
}

export interface TitleEquivalenceClass {
  /** Stable kebab-case identifier - referenced by regression tests, never shown to users. */
  id: string;
  /**
   * Offline curation cross-reference only (e.g. "this class corresponds to
   * ESCO's software-developer concept") - never resolved at runtime. ESCO's
   * occupations pillar was tested as the Tier 2 title-resolution mechanism
   * itself and found non-viable (it doesn't catalog this platform's actual
   * title vocabulary - e.g. "full-stack developer" is absent from every
   * ESCO occupation's alternative-label list); this field only helps a
   * future curator cross-check a class against ESCO's own labels by hand.
   */
  escoConceptId?: string;
  /**
   * Normalized (lowercase, whitespace-collapsed) FULL job-title phrases, all
   * fully interchangeable within this class. See market-de's
   * titleEquivalenceClasses for the exact normalization a phrase must match.
   */
  members: string[];
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
  /**
   * Curated phrase-level title-equivalence classes: FULL normalized job-title
   * strings (not individual words - see titleAliases above), grouped into
   * classes whose members are fully interchangeable ("same occupation,
   * different wording"). A title matching a class member scores 1.0
   * titleSimilarity against any other member of the same class, regardless
   * of shared tokens; a title matching no class falls through unchanged to
   * the existing Jaccard word-overlap score (this can only raise a score,
   * never lower one - same abstention principle as the rest of this
   * investigation's matching work). This replaced ESCO-based Tier 2 title
   * resolution after measurement showed ESCO's occupation taxonomy doesn't
   * catalog this platform's actual title vocabulary. See market-de's
   * titleEquivalenceClasses for the full rationale, the normalization rules,
   * and the audit process every class must pass before shipping.
   */
  titleEquivalenceClasses: TitleEquivalenceClass[];
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
