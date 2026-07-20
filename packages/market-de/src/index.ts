import type { MarketPack } from '@german-smart-apply/shared';
import { buildTitleEquivalenceIndex } from './title-matching.js';

export * from './title-matching.js';
export * from './title-negative-pairs.js';
export * from './curation-engine.js';

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
  // Conservative, hand-curated alias table: every entry maps spellings,
  // abbreviations, or rebrands of the SAME underlying skill/credential to
  // one shared canonical key - it does NOT group merely related-but-distinct
  // skills. E.g. 'Stakeholder Management' and 'Cross-functional Leadership'
  // are adjacent PM competencies, not aliases of each other, and are
  // deliberately absent - see ranking.service.ts's canonicalizeSkill() and
  // eval/dataset/queries.ts's ai-pm-vocabulary-mismatch-de case for why this
  // distinction matters and what it does/doesn't fix. A generous "umbrella"
  // map would silently suppress real skill gaps - the same failure mode
  // career-ops's own upskill.mjs CANONICAL map guards against ("'cloud' must
  // never count as knowing AWS/GCP/Azure"). Applying that same discipline
  // here: short abbreviations that collide with an unrelated meaning
  // elsewhere on this platform (e.g. 'AR' = Augmented Reality in tech vs.
  // Accounts Receivable in finance; 'GTM' = Go-to-Market vs. Google Tag
  // Manager) are excluded entirely, or only aliased via their unambiguous
  // full-phrase form. English-only for now - German-language skill synonyms
  // are a natural follow-up, not folded in here to keep this reviewable.
  //
  // Every entry below survived a 5-lens independent adversarial audit
  // (strict same-concept / cross-category collision / neutral hiring
  // manager / real-world job-posting usage / adversarial devil's advocate)
  // run blind against the full table - each lens saw every entry and voted
  // keep/drop with a reason; entries with a credible drop vote from any
  // lens were removed unless the surviving reasoning clearly outweighed it.
  // 19 originally-shipped entries were cut this way, including 'a/b
  // testing' -> 'experimentation' (unanimous 5/0 drop: A/B testing is one
  // specific technique, 'experimentation' is the broader discipline -
  // multivariate tests, bandits, causal inference - the exact over-collapse
  // pattern this table exists to avoid, caught in solo review for
  // 'Stakeholder Management'/'Cross-functional Leadership' but missed here
  // on first pass). Also cut for the same broader-vs-narrower reason:
  // 'compliance' -> 'regulatory compliance' (bare 'compliance' spans IT/
  // security, healthcare patient-compliance, and HR policy compliance -
  // different work from legal regulatory compliance), 'gdpr' -> 'data
  // protection' (one EU regulation vs. a field spanning other jurisdictions
  // and unrelated IT backup/DR usage), and 'onboarding' -> 'employee
  // onboarding' (bare 'onboarding' commonly means product/customer
  // onboarding, a PM/CS skill, not HR's). Also cut for genuine
  // cross-category abbreviation collisions this platform's own categories
  // create: 'nlp' (also Neuro-Linguistic Programming, a sales/HR coaching
  // credential), 'ui' (also Unemployment Insurance, an HR/benefits term),
  // 'sem' (also Structural Equation Modeling, a data-analyst skill), 'cro'
  // (also Contract Research Organization, a healthcare/pharma term, and
  // Chief Revenue Officer). See the audit's full verdict log for every
  // entry's reasoning if extending this table later.
  skillAliases: {
    // --- Tech ---
    k8s: 'kubernetes',
    golang: 'go',
    postgres: 'postgresql',
    nodejs: 'node.js',
    'node js': 'node.js',
    js: 'javascript',
    reactjs: 'react',
    vuejs: 'vue.js',
    nextjs: 'next.js',
    ml: 'machine learning',
    ux: 'user experience',
    'continuous integration and deployment': 'ci/cd',

    // --- Product management ---
    roadmapping: 'product roadmap',
    'roadmap planning': 'product roadmap',
    okrs: 'objectives and key results',
    'gtm strategy': 'go-to-market strategy',
    kpi: 'key performance indicators',
    kpis: 'key performance indicators',
    mvp: 'minimum viable product',
    prd: 'product requirements document',

    // --- Legal ---
    'ip law': 'intellectual property law',
    'm&a': 'mergers and acquisitions',
    kyc: 'know your customer',
    aml: 'anti-money laundering',

    // --- Marketing ---
    seo: 'search engine optimization',
    ppc: 'pay-per-click advertising',
    ga4: 'google analytics',

    // --- Sales ---
    crm: 'customer relationship management',

    // --- HR ---
    'talent acquisition': 'recruiting',
    recruitment: 'recruiting',
    hris: 'human resources information system',
    dei: 'diversity, equity, and inclusion',

    // --- Finance ---
    'budget management': 'budgeting',
    'p&l management': 'profit and loss management',
    'fp&a': 'financial planning and analysis',

    // --- Healthcare ---
    ehr: 'electronic health records',
    'patient care coordination': 'care coordination',

    // --- Customer support ---
    'customer support': 'customer service',
    'live chat support': 'chat support',
    // Canonical is the metric's own name (matching nps's pattern below), not
    // the bare outcome 'customer satisfaction' - the audit's one dissenting
    // vote on this entry was that CSAT names a specific survey methodology
    // while the broader outcome term could be claimed by anyone; naming the
    // canonical after the metric itself removes that gap.
    csat: 'customer satisfaction score',
    nps: 'net promoter score',
  },
  // Job-title WORD aliases, applied per-token before titleSimilarity's
  // Jaccard comparison (see RankingService's tokenizeTitle()). Much
  // narrower than skillAliases above: an alias here must be interchangeable
  // with its canonical across EVERY common job-title context this platform
  // sees, not just the field that motivated it - a bare word has no
  // surrounding context to disambiguate it, unlike a multi-word skill
  // phrase. Built and adversarially audited the same way as skillAliases
  // (5 independent lenses: strict same-role-word / cross-industry collision
  // hunter / seniority-scope check / real-world job-title usage /
  // adversarial devil's advocate), and the audit rejected every tech-word
  // candidate that was tried, including the obvious one:
  // - 'developer' -> 'engineer': REJECTED. 'Real Estate Developer' and
  //   'Property Developer' are standard, unrelated real-estate titles;
  //   'Business Developer' is a real sales/BD title. This means
  //   'Software Engineer' and 'Full-Stack Developer' - the exact example
  //   plan.md's Phase 4b names - still score 0 titleSimilarity even after
  //   this table. See ranking.service.test.ts's title-alias describe block
  //   for that as an explicit, intentional regression test, not an
  //   oversight - fixing it needs a genuinely different mechanism (semantic/
  //   embedding-based matching, already tracked separately and deliberately
  //   as unimplemented "Phase 3 Growth" scope in plan.md) than a flat word
  //   table can safely provide.
  // - 'dev'/'programmer'/'coder' -> 'engineer': also REJECTED for the same
  //   reason plus their own field-specific collisions ('dev' with
  //   nonprofit-fundraising 'Director of Development' and sales 'Business
  //   Dev'; 'programmer' with arts/media 'Film Programmer'/'Festival
  //   Programmer'; 'coder' with healthcare's 'Medical Coder').
  // - 'eng' -> 'engineer': also REJECTED, on a different axis - 'eng' very
  //   commonly abbreviates the department in leadership titles ('VP of
  //   Eng', 'Head of Eng'), so aliasing it would let a senior org-leader
  //   title token-match a junior individual-contributor posting.
  // Only cross-industry, unambiguous seniority/role-suffix abbreviations
  // survived unanimously.
  titleAliases: {
    sr: 'senior',
    jr: 'junior',
    mgr: 'manager',
    exec: 'executive',
    coord: 'coordinator',
    rep: 'representative',
  },
  // Phrase-level title-equivalence classes (Gate 2 rev B) - the mechanism
  // that replaced ESCO-based Tier 2 title resolution. Measurement (live
  // ESCO API, against Gate 1's labeled queries) showed the occupations
  // pillar both (a) doesn't catalog this platform's actual title vocabulary
  // - "full-stack developer" is absent from the COMPLETE alternative-label
  // list of ESCO's own "software developer" concept, and "Personalreferent"
  // returns zero results outright - and (b) any ranked-search-plus-filter
  // workaround to get coverage back gave false collision-credit on 5/10
  // genuine hard negatives, which is disqualifying under this system's
  // abstention rule (a false positive here silently and permanently inflates
  // a score that should stay low). See the investigation writeup for the
  // full evidence trail.
  //
  // This table is a DIFFERENT, safer mechanism than titleAliases above, not
  // a reapplication of it. titleAliases maps bare WORDS and was rightly kept
  // narrow because a bare word has no context - 'developer' -> 'engineer'
  // was rejected there specifically because 'Real Estate Developer' and
  // 'Business Developer' are real, unrelated titles that share that one
  // word. A class below matches the FULL, exact normalized title string, so
  // a class containing 'full stack developer' can never fire on 'real
  // estate developer' or 'business developer' - neither is a member, and
  // partial/substring credit is never given. This is what makes phrase-level
  // safe where word-level wasn't: only an exact full-phrase hit can trigger
  // a match, never a shared bare word.
  //
  // Each class answers ONLY "same occupation, interchangeable wording?" -
  // seniority and stack/domain specifics are deliberately out of scope here
  // (the seniority-fit and skillOverlap dimensions' job respectively - same
  // calibration principle as the Gate 2 spec's seniority note). A title with
  // no class match falls through unchanged to the existing Jaccard score -
  // this table can only raise titleSimilarity, never lower it.
  //
  // Full-phrase matching is deliberately exact, INCLUDING how the German
  // masculine/feminine slash convention is handled
  // ("Softwareentwickler/Softwareentwicklerin"): resolveTitleEquivalence-
  // ClassId only splits a slash into segments when one segment is a prefix
  // of the other (true of gender pairs, false for an unrelated hybrid title
  // like "Business Developer / Software Developer"). A generic slash split
  // would let that hybrid title reach this class through its "software
  // developer" sibling - a real collision entering through a door the
  // negative-pair suite below doesn't cover, and a direct violation of the
  // point above (only an exact full-phrase hit should ever count).
  //
  // escoConceptId is offline curation metadata only (lets a future curator
  // cross-reference a class against ESCO's own alt-label list by hand) -
  // never resolved at runtime. ESCO is not on the runtime path anywhere in
  // this mechanism.
  //
  // Audited the same way as skillAliases/titleAliases: every class and every
  // known collision case goes through the same 5-lens adversarial review
  // (strict same-occupation / cross-industry collision hunter / neutral
  // hiring-manager review / real-world usage / adversarial devil's advocate)
  // before shipping. See ranking.service.test.ts's title-equivalence-class
  // describe block for the flagship regression test and the permanent
  // negative-pair suite (every collision case titleAliases' own audit
  // already found - Real Estate Developer, Business Developer, Film
  // Programmer, Medical Coder - re-asserted here so no future class can
  // silently reproduce them).
  titleEquivalenceClasses: [
    {
      id: 'software-engineer',
      escoConceptId: 'http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1',
      members: [
        'software engineer',
        'software developer',
        'full stack developer',
        'fullstack developer',
        'softwareentwickler',
        'softwareentwicklerin',
      ],
    },
  ],
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

/**
 * Precomputed once at module load - see buildTitleEquivalenceIndex's comment
 * for why this is a normalized index rather than a repeated linear scan
 * over titleEquivalenceClasses[].members on every call.
 */
export const titleEquivalenceIndex = buildTitleEquivalenceIndex(marketDe.titleEquivalenceClasses);

export default marketDe;
