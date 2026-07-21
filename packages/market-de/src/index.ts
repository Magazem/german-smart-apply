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
      // Live-verified 2026-07-21: original 10 via
      // workers/scripts/verify_source_tokens.py; the 25 below via a
      // live-network discovery pass, each screened against its real,
      // complete Greenhouse job list and kept only if >=30% of current
      // listings are Germany-located -- large global boards with only a
      // thin DE presence (e.g. Stripe, Airbnb, Databricks) were deliberately
      // excluded despite resolving. See workers/common/market_de.py's fuller
      // comment for the full reasoning; keep the two lists in lockstep.
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
          'airup',
          'alpineeagle',
          'anydesk',
          'avimedical',
          'blackforestlabs',
          'commercetools',
          'doctolib',
          'flaconi',
          'freenow',
          'helsing',
          'isaraerospace',
          'konux',
          'marvelfusion',
          'moia',
          'moonfare',
          'parloa',
          'scout24',
          'staffbase',
          'strato',
          'typeform',
          'urbansportsclub',
          'vay',
          'wooga',
          'wunderflats',
          'zattoo',
        ],
      },
    },
    {
      sourceId: 'lever-de',
      sourceType: 'lever',
      displayName: 'Lever (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // The original 20 candidates all returned zero jobs. A second
      // live-network discovery pass (2026-07-21) found 43 genuinely working
      // Lever slugs, screened down to 6 the same way as the Greenhouse list
      // above (>=30% of current postings Germany-located) -- most
      // candidates were non-German companies with only a thin German-office
      // presence, or evident job-aggregator/staffing platforms rather than
      // single employers. See workers/common/market_de.py's fuller comment.
      config: {
        siteSlugs: ['kolibrigames', 'crytek', 'finn', 'vivenu', 'netlight', 'agicap'],
      },
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
      // Mirrored in workers/common/market_de.py, which also carries the
      // domainAllowlist note: unlike Greenhouse/Lever, each Personio company
      // has its own subdomain host, so that allowlist must be kept in
      // lockstep with whatever gets added here.
      // Live-verified 2026-07-21: candis/clark via
      // workers/scripts/verify_source_tokens.py; the other 98 via a
      // live-network WebSearch-grounded discovery pass (real German
      // SME/Mittelstand companies found through their actual careers pages)
      // -- every one returned a nonzero job count against the real Personio
      // XML feed. See workers/common/market_de.py's fuller comment for why
      // this list skews toward smaller/mid-size companies rather than
      // consumer unicorns (Personio's real adoption pattern in Germany).
      config: {
        companySubdomains: [
          'candis',
          'clark',
          '1komma5grad',
          '4401',
          'agenturennetz',
          'agt-bus-eventlogistik-gmbh',
          'aktiv-apotheken-ohg',
          'algol-consulting',
          'anqa-itsecurity-de',
          'appliedai',
          'asb-berlin',
          'asg',
          'autohaus-bleker-gmbh',
          'autohaus-kahle-gmbh-co-kg',
          'autohaus-timmermanns',
          'autohaus-unterberger-gmbh',
          'autohaus-zemke',
          'banxware',
          'brix-consult-gmbh',
          'canal-control',
          'capmo',
          'cloover',
          'compipower-gmbh',
          'constanta-treuhand-gmbh',
          'cps-group',
          'cyber-wear',
          'cycle',
          'dci',
          'dedicom',
          'dgnb',
          'digital-loop',
          'dpa',
          'egym',
          'einhundert-energie-gmbh',
          'en-software',
          'entrix',
          'eqs-group',
          'eraneos',
          'erste-hausverwaltung-gmbh',
          'everreal',
          'falstaff',
          'filu-gmbh',
          'findiq-gmbh',
          'friedrich-zufall-gmbh',
          'frommer-legal',
          'gastro-soul',
          'gel-express-logistik',
          'gross-und-partner',
          'hafencity-hamburg',
          'hochfrequenz-unternehmensberatung-gmbh',
          'home-of-mobility',
          'hwp',
          'hws',
          'iits',
          'insglueck',
          'isg-express-logistik-gmbh',
          'its-gruppe',
          'jcb-deutschland-gmbh',
          'jobleads',
          'kabs-service-logistik-gmbh',
          'kcx',
          'kita-kinderzimmer',
          'lahrlogistics-gmbh',
          'laura-seiler-life-coaching-gmbh',
          'lautsprecherteufel',
          'legalhero',
          'lytd',
          'marketconsultive',
          'meyerpartner',
          'miles-mobility',
          'mobilityconcept',
          'munich-private-equity-ag',
          'neoom',
          'neumeier-ag',
          'nexum-ag',
          'pflege-de',
          'piabo',
          'pitch',
          'pm-team',
          'prenode',
          'raceon',
          'rebike-mobility',
          'ritterwald-unternehmensberatung-gmbh',
          'seek-development',
          'spedition-kruse',
          'stark',
          'startup-insider',
          'super-ai',
          'synvert',
          'syseleven',
          'taxy-io-gmbh',
          'teamative',
          'tierarztpluspartner',
          'tmh',
          'tngtech',
          'von-der-weppen',
          'wwp',
          'xitaso',
          'zeo-solar',
          'zollsoft',
        ],
      },
    },
    {
      sourceId: 'smartrecruiters-de',
      sourceType: 'smartrecruiters',
      displayName: 'SmartRecruiters (DE companies)',
      trustTier: 'high',
      crawlFrequencyMinutes: 240,
      // Live-verified 2026-07-21: Continental via
      // workers/scripts/verify_source_tokens.py; the 18 below via a
      // live-network discovery pass, screened by SmartRecruiters' structured
      // location.country field rather than a text heuristic -- each sampled
      // either 100% Germany-located (small/fully-sampled boards) or >=90% of
      // a 100-posting sample of a larger one. Large boards with only a thin,
      // unreliably-sampled DE fraction (e.g. BoschGroup) were deliberately
      // excluded. See workers/common/market_de.py's fuller comment,
      // including why Continental itself (~16% DE of 949 postings) stays as
      // configured rather than being retroactively curated out.
      config: {
        companyIdentifiers: [
          'Continental',
          'RVAllgemeineVersicherungenAG',
          'BayWaAG',
          'ATUAuto-Teile-Unger',
          'ArtemedSE',
          'BarmeniaGothaerAG',
          'burgerme',
          'VitosgGmbH',
          'Contilia1',
          'StrerSECoKGaAStrerGruppe',
          'ABOUTYOUGmbH',
          'EBreuningerGmbHCo',
          'ScalableGmbH',
          'ThaliaBcherGmbH1',
          'Tipico',
          'DreesSommerSE',
          'Redcare-Pharmacy',
          'Gerresheimer',
          'StepStoneGroup',
        ],
      },
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
        // Added post-PR2: the platform's first real curated addition,
        // sourced from a live curation run against 1,589 real crawled
        // titles and passed through the full 5-lens audit. 5/5 lenses
        // confirmed this is Germany's everyday synonym for
        // Softwareentwickler (anchored in the official
        // "Fachinformatiker/-in Fachrichtung Anwendungsentwicklung"
        // apprenticeship) with no cross-field collision found. Its
        // near-homograph "Applikationsentwickler" was proposed alongside it
        // by the same live LLM call but is deliberately NOT added here -
        // two independent lenses found it also names a real, unrelated
        // chemistry/materials-science "Anwendungstechnik" role (adhesives/
        // coatings/pharma formulation) plus a SAP/ERP-support-hybrid sense -
        // see the TITLE_NEGATIVE_PAIRS entry below. Exactly the failure mode
        // §0's design law exists to catch before it ships, not after.
        'anwendungsentwickler',
      ],
    },
    // The seven classes below all came from the same source: PR3's
    // zero-token-overlap eval queries surfaced 9 real, evidence-backed
    // candidate pairs (each already independently adversarially verified
    // while drafting those queries). Every one of the 9 went through a
    // SECOND, full 5-lens audit before being considered for
    // titleEquivalenceClasses membership - eval-query relevance grading and
    // permanent class membership are different bars (a labeled query judges
    // one specific documented job; a class fires unconditionally on every
    // future job matching the phrase, forever), so passing the former does
    // not exempt a pair from the latter. Two of the 9 (qa-engineer,
    // product-owner) failed this second audit outright and are NOT added -
    // see the PR commit message / spec for the full reasoning. Two more
    // (copywriter, registered-nurse) shipped with a MODIFIED member: the
    // audit found the originally-proposed bare term unsafe and converged
    // unanimously on a specific safe substitute, the same shape as
    // Anwendungsentwickler's own audit above.
    {
      id: 'in-house-counsel',
      members: [
        // 5/5 keep on both members. Confirmed in-house-counsel occupation
        // identity (Duden's Justiziar definition; a real StepStone posting
        // "Legal Counsel / Justiziar (m/w/d)" requiring the Volljurist
        // qualification this class targets). Syndikusrechtsanwalt (a
        // separately bar-regulated credential) and Justizvollzugsbeamter (a
        // corrections officer, "Justiz-" root collision only) were both
        // explicitly checked and correctly stay excluded.
        'unternehmensjurist',
        'justiziar',
      ],
    },
    {
      id: 'copywriter',
      members: [
        // Copywriter: 5/5 keep. Texter (bare): 5/5 DROP - every lens
        // independently found the same real collision: bare "Texter" is
        // also standard shorthand for "Liedtexter" (song lyricist, a
        // wholly unrelated music-industry occupation) and is a literal
        // substring of "Videotexter" (broadcast Teletext editor). All 5
        // lenses converged on the same fix: BERUFENET's own official,
        // already-disambiguated occupation title "Werbetexter/in" carries
        // none of that risk (the "Werbe-" prefix is exactly what Liedtexter
        // and Videotexter lack) and is not itself the anchor of any known
        // collision. Used here instead of bare "Texter".
        'copywriter',
        'werbetexter',
      ],
    },
    {
      id: 'sales-representative',
      members: [
        // Sales Representative: 5/5 keep. Handelsvertreter: 3/5 keep - two
        // lenses raised a credible-looking risk (insurance agents are
        // legally a species of Handelsvertreter under §92 HGB, so bare
        // "Handelsvertreter" could bridge to ISCO 3321 Insurance
        // Representatives, a different occupation than this class's ISCO
        // 3322 anchor) but a live search of real recruiting titles (StepStone
        // + a direct DVAG/OVB check) found insurance/Strukturvertrieb firms
        // recruit under their own distinct titles ("Vermögensberater",
        // "Versicherungsvertreter" under §34d/§34f GewO), never bare
        // "Handelsvertreter" - the theoretical legal-taxonomy risk doesn't
        // materialize in real posting titles. §84 HGB's self-employed-status
        // requirement is a separate, already-adjudicated non-issue (out of
        // scope for title-equivalence, which measures task/occupation
        // identity only).
        'sales representative',
        'handelsvertreter',
      ],
    },
    {
      id: 'hr-generalist',
      members: [
        // 5/5 keep on both members. Multiple real DACH employers (ADAC,
        // SieMatic, BVG Berlin, Spraying Systems Europa) advertise this
        // exact role as "Personalreferent / HR-Generalist (m/w/d)" for one
        // requisition. HR Business Partner (a distinct, more senior/
        // strategic rung - already confirmed via a dedicated 5-lens audit,
        // 5/5 drop, see TITLE_NEGATIVE_PAIRS) and Personalsachbearbeiter (a
        // narrower administrative tier) were both explicitly checked and
        // correctly stay excluded.
        'personalreferent',
        'hr generalist',
      ],
    },
    {
      id: 'general-ledger-accountant',
      members: [
        // 5/5 keep on both members. Three real DACH employers (ECE Hamburg,
        // Salzgitter AG, HAPEKO) dual-title this exact role -
        // "Bilanzbuchhalter - General Ledger Accountant (m/w/d)" and
        // similar. Finanzbuchhalter (a one-step-more-junior sibling, no IHK
        // Bilanzbuchhalter certification) and Leiter Rechnungswesen
        // (accounting-department leadership, not hands-on ledger work) were
        // both explicitly checked and correctly stay excluded.
        'bilanzbuchhalter',
        'general ledger accountant',
      ],
    },
    {
      id: 'registered-nurse',
      members: [
        // Gesundheits- und Krankenpfleger: 5/5 keep - the precise, unambiguous
        // pre-2020 legal title for hospital/acute-care nursing, still in
        // active real-world use (e.g. DRK Kliniken Berlin). Bare
        // "Pflegefachkraft": 4/5 DROP - the 2020 Pflegeberufegesetz folded
        // acute-hospital, pediatric, AND geriatric/elder-care (Altenpflege)
        // nursing into one generalist qualification, so the bare umbrella
        // term genuinely spans both settings in real postings (confirmed:
        // hundreds of live Altenheim/Pflegeheim listings use the identical
        // bare string). Admitting it here would reproduce exactly the
        // acute-vs-geriatric over-collapse this session's own eval query
        // already treats as a real, distinct specialization gap (its
        // Altenpfleger/Seniorenzentrum job is graded relevance 2, not
        // identical) - the eval query's own flagship job used an explicit
        // "- Akutstation" qualifier for the same reason, and that qualified
        // form is what's used here instead of the bare umbrella term.
        'gesundheits- und krankenpfleger',
        'pflegefachkraft akutstation',
      ],
    },
    {
      id: 'customer-service-representative',
      members: [
        // 5/5 keep, 4/5 keep. Kundenservice-Mitarbeiter is the generic,
        // unregulated umbrella title for frontline customer support across
        // German industries. Servicefachkraft für Dialogmarketing (BERUFENET
        // occupation 35309, a real 2-year BIBB/IHK apprenticeship) has a
        // defined core - Kundenbetreuung/Kundenbindung/Kundengewinnung,
        // handling orders/inquiries/complaints by phone/e-mail/digital
        // channels - that matches directly; one lens raised an
        // outbound/telemarketing concern but the occupation's own official
        // definition centers inbound service work, and real non-apprenticeship
        // postings (e.g. Sparkasse) confirm inbound-weighted day-to-day duties
        // in practice. Kaufmann für Dialogmarketing (the real, broader 3-year
        // sibling occupation - adds personnel/controlling scope), Teamleiter
        // Kundenservice (seniority/scope gap), and Kaufmann im Einzelhandel
        // (unrelated retail sales) were all explicitly checked and correctly
        // stay excluded.
        'kundenservice-mitarbeiter',
        'servicefachkraft für dialogmarketing',
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
