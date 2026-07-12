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
      config: { boardTokens: [] },
    },
    {
      sourceId: 'lever-de',
      sourceType: 'lever',
      displayName: 'Lever (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
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
      config: {},
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
  },
  cvFormattingNorms: {
    preferredLengthPages: 2,
    photoExpected: false,
    dateFormat: 'MM/YYYY',
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
  rankingWeights: {
    titleSimilarity: 0.25,
    skillOverlap: 0.25,
    locationFit: 0.15,
    recency: 0.1,
    salaryFit: 0.1,
    languageFit: 0.05,
    sourceTrust: 0.05,
    riskPenalty: 0.05,
  },
};

export default marketDe;
