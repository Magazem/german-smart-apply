import type { MarketPack } from '@german-smart-apply/shared';

export const marketDe: MarketPack = {
  countryCode: 'DE',
  displayName: 'Germany',
  status: 'active',
  sources: [
    {
      sourceId: 'greenhouse-de',
      sourceType: 'greenhouse',
      displayName: 'Greenhouse (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // Live-verified via workers/scripts/verify_source_tokens.py (each
      // token returned a nonzero job count against the real Greenhouse
      // API) -- do not add further tokens here without the same live
      // check first. Mirrored in workers/common/market_de.py.
      config: {
        boardTokens: [
          'n26',
          'getyourguide',
          'celonis',
          'contentful',
          'hellofresh',
          'grover',
          'trivago',
          'solarisbank',
          'traderepublic',
          'raisin',
        ],
      },
    },
    {
      sourceId: 'lever-de',
      sourceType: 'lever',
      displayName: 'Lever (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // 20 candidate German/European tech companies were live-checked and
      // every one returned zero jobs / not found -- none of the tried
      // candidates actually use Lever (or use an unguessed slug spelling).
      // Left empty rather than guessing further.
      config: { siteSlugs: [] },
    },
    {
      sourceId: 'arbeitsagentur',
      sourceType: 'arbeitsagentur',
      displayName: 'Bundesagentur für Arbeit — Jobsuche API',
      trustTier: 'high',
      crawlFrequencyMinutes: 360,
      config: { baseUrl: 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service' },
    },
    {
      sourceId: 'stepstone-structured',
      sourceType: 'stepstone',
      displayName: 'Stepstone structured feed',
      trustTier: 'medium',
      crawlFrequencyMinutes: 360,
      // BLOCKED (not an engineering gap): no documented public Stepstone
      // feed API exists. Real access needs a partnerships conversation with
      // Stepstone, not more adapter code.
      config: {},
    },
    {
      sourceId: 'personio-de',
      sourceType: 'personio',
      displayName: 'Personio (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // companySubdomains starts empty, same bootstrapping pattern as
      // greenhouse-de/lever-de above. Mirrored in workers/common/market_de.py,
      // which also carries the domainAllowlist note: unlike Greenhouse/Lever,
      // each Personio company has its own subdomain host, so that allowlist
      // must be kept in lockstep with whatever gets added here.
      // Live-verified via workers/scripts/verify_source_tokens.py.
      config: { companySubdomains: ['candis', 'clark'] },
    },
    {
      sourceId: 'smartrecruiters-de',
      sourceType: 'smartrecruiters',
      displayName: 'SmartRecruiters (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // Live-verified via workers/scripts/verify_source_tokens.py.
      config: { companyIdentifiers: ['Continental'] },
    },
  ],
  languagePrompts: {
    cvSummary:
      'Summarize this CV for a German job market audience in {{language}}. Be concise, factual, and highlight measurable achievements.',
    coverLetter:
      'Write a professional, ATS-friendly cover letter in {{language}} for the role of {{jobTitle}} at {{companyName}}, tailored to the candidate profile provided. Follow German business-letter conventions (formal register, Sehr geehrte/r for German text).',
    matchExplanation:
      'Explain in {{language}} why this candidate is a good fit for {{jobTitle}}, in 2-3 short sentences, referencing concrete overlap between the candidate skills and the job requirements.',
    followUpEmail:
      'Write a brief, polite follow-up email in {{language}} from the candidate to the hiring team for {{jobTitle}} at {{companyName}}, referencing that it has been {{daysSinceApplied}} days since they applied. Reaffirm interest and ask for a status update. Follow German business-email conventions (formal register, Sehr geehrte/r for German text). Keep it short - a few sentences, not a full letter.',
    interviewPrep:
      'Prepare the candidate in {{language}} for an interview for {{jobTitle}} at {{companyName}}. Generate 5-8 likely interview questions tailored to this role and company (mix of behavioral and role-specific/technical questions), plus 3-5 short talking points the candidate can use, each grounded in a concrete overlap between their profile and the job requirements. Keep questions and talking points concise and specific, not generic.',
    roleGapAnalysis:
      'Analyze in {{language}} how well this candidate matches the target role of {{targetRole}}, using only the candidate profile and the sample of real job postings and skill-tag frequency data provided. Identify which required skills the candidate already has (matchingSkills), which real, commonly-requested skills from the sample postings the candidate is missing (missingSkills), concrete learning topics that would close those gaps (suggestedLearningTopics), and any relevant certifications commonly requested in these postings (suggestedCertifications). Give an honest estimatedReadinessScore from 0-100 and a short summary explaining it.',
  },
  cvFormattingNorms: {
    preferredLengthPages: 2,
    photoExpected: false,
    dateFormat: 'MM/YYYY',
  },
  coverLetterFormattingNorms: {
    preferredLengthWords: 380,
  },
  salaryParsing: {
    currency: 'EUR',
    thousandsSeparator: '.',
    decimalSeparator: ',',
  },
  locationDictionary: {
    berlin: 'Berlin',
    münchen: 'Munich',
    munich: 'Munich',
    koeln: 'Cologne',
    köln: 'Cologne',
    cologne: 'Cologne',
    frankfurt: 'Frankfurt am Main',
    'frankfurt am main': 'Frankfurt am Main',
    hamburg: 'Hamburg',
    stuttgart: 'Stuttgart',
    duesseldorf: 'Düsseldorf',
    düsseldorf: 'Düsseldorf',
    leipzig: 'Leipzig',
    remote: 'Remote',
    homeoffice: 'Remote',
  },
  scamHeuristics: {
    suspiciousDomainPatterns: [
      '\\.tk$',
      '\\.ml$',
      'gmail\\.com$',
      'whatsapp',
      'telegram',
    ],
    suspiciousContactPatterns: [
      'send.*(iban|bank details|kontodaten)',
      'pay.*(registration fee|startgeb\\u00fchr|deposit)',
      'whatsapp.*only',
      'no interview required',
      'wire transfer',
    ],
  },
  // Mirrored in workers/common/market_de.py::COMPANY_ALIASES -- see that
  // file's comment for which entries are evidence-based (observed in real
  // crawled raw_jobs) vs speculative seeding for currently-unconfigured
  // ATS sources, and why corporate-family mergers (e.g. Audi/VW) are
  // deliberately excluded.
  companyAliases: {
    'sap se': ['SAP', 'SAP AG', 'SAP Deutschland'],
    'zalando se': ['Zalando', 'Zalando SE'],
    'deutsche telekom ag': ['Deutsche Telekom', 'T-Systems', 'Telekom'],
    'ergo': ['ERGO Group'],
    'ferchau': [
      'Ferchau GmbH',
      'Ferchau GmbH Niederlassung Bremen City',
      'Ferchau GmbH Niederlassung Lübeck',
      'Ferchau GmbH Niederlassung Rosenheim',
    ],
    'siemens ag': ['Siemens', 'Siemens Deutschland'],
    'robert bosch gmbh': ['Bosch', 'Robert Bosch'],
    'allianz se': ['Allianz', 'Allianz Deutschland'],
    'continental ag': ['Continental', 'Conti'],
  },
  // Rebalanced so domain fit (titleSimilarity + skillOverlap, the only two
  // signals that actually measure whether the job is in the candidate's
  // field) dominates the score - 64% combined, up from 50%. Before this, a
  // job in a completely unrelated field could still reach ~45-48% purely
  // from location/recency/salary/language/sourceTrust defaults, which don't
  // know or care what field the job is in. See ranking.service.ts's
  // skillOverlap() for the matching floor-value fix (0.3 -> 0.1).
  rankingWeights: {
    titleSimilarity: 0.32,
    skillOverlap: 0.32,
    locationFit: 0.1,
    recency: 0.07,
    salaryFit: 0.08,
    languageFit: 0.03,
    sourceTrust: 0.03,
    riskPenalty: 0.05,
  },
};

export default marketDe;
