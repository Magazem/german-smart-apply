import { describe, expect, it } from 'vitest';
import {
  marketDe,
  resolveTitleEquivalenceClassId,
  SKILL_EVIDENCE_TARGET,
  titleEquivalenceIndex,
  TITLE_NEGATIVE_PAIRS,
} from '@german-smart-apply/market-de';
import type { CanonicalJob } from '@german-smart-apply/shared';
import { RankingService, type RankingProfileInput } from './ranking.service.js';

function buildJob(overrides: Partial<CanonicalJob> = {}): CanonicalJob {
  return {
    jobId: 'job-1',
    sourceId: 'source-1',
    sourceType: 'greenhouse',
    sourceUrl: 'https://example.com',
    originalJobId: 'ext-1',
    companyNameRaw: 'Acme GmbH',
    companyNameNormalized: 'acme gmbh',
    jobTitleRaw: 'Backend Engineer',
    jobTitleNormalized: 'backend engineer',
    jobDescriptionHtml: null,
    jobDescriptionText: 'Build APIs.',
    language: 'en',
    locationRaw: 'Berlin',
    locationNormalized: 'Berlin',
    countryCode: 'DE',
    remoteType: 'hybrid',
    employmentType: 'full_time',
    seniority: 'mid',
    salaryMin: 40000,
    salaryMax: 55000,
    salaryCurrency: 'EUR',
    techStackTags: [],
    applyUrl: 'https://example.com/apply',
    postedAt: new Date().toISOString(),
    crawledAt: new Date().toISOString(),
    sourceTrustScore: 0.9,
    scamRiskScore: 0.02,
    duplicateConfidence: 1,
    ...overrides,
  };
}

function buildProfile(overrides: Partial<RankingProfileInput> = {}): RankingProfileInput {
  return {
    skills: [],
    targetRole: 'Backend Engineer',
    targetCountryCode: 'DE',
    preferredLanguage: 'en',
    languages: [],
    seniority: 'mid',
    locationPreference: 'any',
    homeCity: null,
    acceptableCities: [],
    relocationWillingness: null,
    salaryTargetMin: null,
    salaryTargetMax: null,
    commutePreferenceKm: null,
    ...overrides,
  };
}

describe('RankingService.score - salaryFit', () => {
  const service = new RankingService();

  it('reports salaryFit as null and flags no_candidate_target when the candidate has no salary target', () => {
    const result = service.score(buildJob(), { profile: buildProfile() });
    expect(result.salaryFit).toBeNull();
    expect(result.salaryFitUnavailableReason).toBe('no_candidate_target');
  });

  it('reports salaryFit as null and flags no_job_salary when the candidate has a target but the job discloses no salary', () => {
    const result = service.score(buildJob({ salaryMin: null, salaryMax: null }), {
      profile: buildProfile({ salaryTargetMin: 50000 }),
    });
    expect(result.salaryFit).toBeNull();
    expect(result.salaryFitUnavailableReason).toBe('no_job_salary');
  });

  it('excludes salary from totalScore entirely when unavailable, rather than assuming a neutral 0.5', () => {
    // Enough matched skills to reach a full skillOverlap - the point of this
    // case is a job that is perfect on every measurable dimension, and skill
    // fit is now scored against SKILL_EVIDENCE_TARGET distinct matches
    // rather than the presence of any single one.
    const perfectSkills = ['typescript', 'postgres', 'docker', 'kafka', 'graphql'];
    const profile = buildProfile({
      targetRole: 'Backend Engineer',
      skills: perfectSkills,
      locationPreference: 'hybrid',
      targetCountryCode: 'DE',
      preferredLanguage: 'en',
      languages: ['en'],
      salaryTargetMin: null,
      salaryTargetMax: null,
    });
    const job = buildJob({
      jobTitleNormalized: 'backend engineer',
      techStackTags: perfectSkills,
      remoteType: 'hybrid',
      countryCode: 'DE',
      language: 'en',
      salaryMin: null,
      salaryMax: null,
      sourceTrustScore: 1,
      scamRiskScore: 0,
      // Forces recencyBoost's ageDays < 0 branch, which returns exactly 1 -
      // every other dimension above is also engineered to be exactly 1, so
      // this job is a perfect match on everything measurable.
      postedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const result = service.score(job, { profile });
    const weights = marketDe.rankingWeights;
    const totalPositiveWeight =
      weights.titleSimilarity +
      weights.skillOverlap +
      weights.locationFit +
      weights.recency +
      weights.salaryFit +
      weights.languageFit +
      weights.sourceTrust;

    expect(result.salaryFit).toBeNull();
    // Renormalized weighted average over the measured dimensions, projected
    // back onto the full weight budget - a perfect match on everything else
    // reaches the same ceiling it would if salary were also known and
    // perfect, instead of being capped below it by an assumed 0.5.
    expect(result.totalScore).toBeCloseTo(totalPositiveWeight, 5);
    // Strictly above what the old "fold in a neutral 0.5" formula would have
    // produced for this exact scenario - proof salary is genuinely excluded
    // from the calculation now, not just hidden from the breakdown UI.
    expect(result.totalScore).toBeGreaterThan(totalPositiveWeight - weights.salaryFit * 0.5);
  });

  it('treats an explicit salaryTargetMin of 0 as "no floor", not "unset" - job clearing it scores a perfect fit', () => {
    const result = service.score(buildJob({ salaryMin: 40000, salaryMax: 55000 }), {
      profile: buildProfile({ salaryTargetMin: 0, salaryTargetMax: null }),
    });
    expect(result.salaryFit).toBe(1);
  });

  it('still scores a perfect fit when the job range comfortably clears a real target minimum', () => {
    const result = service.score(buildJob({ salaryMin: 40000, salaryMax: 120000 }), {
      profile: buildProfile({ salaryTargetMin: 60000 }),
    });
    expect(result.salaryFit).toBe(1);
  });

  it('penalizes a job whose range does not overlap the target range', () => {
    const result = service.score(buildJob({ salaryMin: 30000, salaryMax: 35000 }), {
      profile: buildProfile({ salaryTargetMin: 60000, salaryTargetMax: 80000 }),
    });
    expect(result.salaryFit).toBe(0.1);
  });
});

describe('RankingService.score - eligibility (hard constraints) vs. locationFit (soft fit)', () => {
  const service = new RankingService();

  it('reports eligible: true and an unpenalized locationFit when the job matches the target country', () => {
    const job = buildJob({ countryCode: 'DE', remoteType: 'hybrid' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' }) });
    expect(result.eligible).toBe(true);
    expect(result.locationFit).toBe(1);
  });

  it('reports eligible: false on a country mismatch, but leaves locationFit reporting pure work-mode fit', () => {
    const job = buildJob({ countryCode: 'ES', remoteType: 'hybrid' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' }) });
    expect(result.eligible).toBe(false);
    // locationFit no longer folds the country mismatch in - it's the same
    // pure work-mode fit as the DE case above, not silently discounted.
    expect(result.locationFit).toBe(1);
  });

  it('still discounts totalScore for a country mismatch, via the separate eligibilityPenalty', () => {
    const jobMatch = buildJob({ countryCode: 'DE', remoteType: 'hybrid' });
    const jobMismatch = buildJob({ countryCode: 'ES', remoteType: 'hybrid' });
    const profile = buildProfile({ targetCountryCode: 'DE', locationPreference: 'hybrid' });
    const eligible = service.score(jobMatch, { profile });
    const ineligible = service.score(jobMismatch, { profile });
    expect(ineligible.totalScore).toBeLessThan(eligible.totalScore);
  });

  it('treats an empty targetCountryCode as no hard constraint - always eligible', () => {
    const job = buildJob({ countryCode: 'ES' });
    const result = service.score(job, { profile: buildProfile({ targetCountryCode: '' }) });
    expect(result.eligible).toBe(true);
  });

  it('defaults eligible to true when there is no profile to check against', () => {
    const job = buildJob({ countryCode: 'ES' });
    const result = service.score(job, { profile: null });
    expect(result.eligible).toBe(true);
  });
});

describe('RankingService.score - interactionBias', () => {
  const service = new RankingService();

  it('boosts totalScore for a job the user liked, relative to the same job with no feedback', () => {
    const job = buildJob();
    const neutral = service.score(job, { profile: buildProfile() });
    const liked = service.score(job, { profile: buildProfile(), interactionBias: 1 });
    expect(liked.totalScore).toBeGreaterThan(neutral.totalScore);
  });

  it('lowers totalScore for a job the user skipped, relative to the same job with no feedback', () => {
    const job = buildJob();
    const neutral = service.score(job, { profile: buildProfile() });
    const skipped = service.score(job, { profile: buildProfile(), interactionBias: -1 });
    expect(skipped.totalScore).toBeLessThan(neutral.totalScore);
  });

  it('leaves totalScore unchanged when interactionBias is undefined (no feedback recorded)', () => {
    // postedAt: null (not the default new Date()) pins recencyBoost to an
    // exact constant (0.4) - otherwise this exact-equality assertion is
    // flaky, since the two score() calls below each read Date.now()
    // independently and can straddle a millisecond tick.
    const job = buildJob({ postedAt: null });
    const withUndefined = service.score(job, { profile: buildProfile(), interactionBias: undefined });
    const withoutField = service.score(job, { profile: buildProfile() });
    expect(withUndefined.totalScore).toBe(withoutField.totalScore);
  });
});

describe('RankingService.score - locationFit commutePreferenceKm placeholder', () => {
  const service = new RankingService();

  it('discounts an onsite match when the candidate has set a commute radius (unverifiable without geo data)', () => {
    const job = buildJob({ remoteType: 'onsite' });
    const withoutCommutePref = service.score(job, {
      profile: buildProfile({ locationPreference: 'onsite', commutePreferenceKm: null }),
    });
    const withCommutePref = service.score(job, {
      profile: buildProfile({ locationPreference: 'onsite', commutePreferenceKm: 20 }),
    });
    expect(withoutCommutePref.locationFit).toBe(1);
    expect(withCommutePref.locationFit).toBeCloseTo(0.9);
  });

  it('also discounts a hybrid match, not just onsite', () => {
    const job = buildJob({ remoteType: 'hybrid' });
    const result = service.score(job, {
      profile: buildProfile({ locationPreference: 'hybrid', commutePreferenceKm: 20 }),
    });
    expect(result.locationFit).toBeCloseTo(0.9);
  });

  it('does not discount a fully remote job, even with a commute radius set', () => {
    const job = buildJob({ remoteType: 'remote' });
    const result = service.score(job, {
      profile: buildProfile({ locationPreference: 'remote', commutePreferenceKm: 20 }),
    });
    expect(result.locationFit).toBe(1);
  });
});

describe('RankingService.score - conservative skill aliasing (skillAliases)', () => {
  const service = new RankingService();

  // One representative pair per category skillAliases covers - each is a
  // genuine same-concept rename (abbreviation, spelling variant, rebrand),
  // not just a related skill. See market-de's skillAliases comment.
  const ALIAS_PAIRS: [string, string, string][] = [
    ['K8s', 'Kubernetes', 'tech'],
    ['Roadmapping', 'Product Roadmap', 'product management'],
    ['IP Law', 'Intellectual Property Law', 'legal'],
    ['SEO', 'Search Engine Optimization', 'marketing'],
    ['CRM', 'Customer Relationship Management', 'sales'],
    ['Talent Acquisition', 'Recruiting', 'HR'],
    ['FP&A', 'Financial Planning and Analysis', 'finance'],
    ['EHR', 'Electronic Health Records', 'healthcare'],
    ['Customer Support', 'Customer Service', 'customer support'],
  ];

  it.each(ALIAS_PAIRS)('treats "%s" and "%s" (%s) as the same skill despite zero literal token overlap', (skill, tag) => {
    const job = buildJob({ techStackTags: [tag] });
    const result = service.score(job, { profile: buildProfile({ skills: [skill] }) });

    // Asserted as a property rather than a magic number: the alias must earn
    // exactly what spelling the skill the job's own way would have earned,
    // and strictly more than no match at all. Stays meaningful if
    // SKILL_EVIDENCE_TARGET is later retuned against the eval harness.
    const literalMatch = service.score(buildJob({ techStackTags: [tag] }), {
      profile: buildProfile({ skills: [tag] }),
    });
    expect(result.skillOverlap).toBe(literalMatch.skillOverlap);
    expect(result.skillOverlap).toBeCloseTo(1 / SKILL_EVIDENCE_TARGET);
    expect(result.skillOverlap!).toBeGreaterThan(0);
  });

  it('does NOT credit adjacent-but-distinct PM competencies as a skill match - the conservative boundary', () => {
    // Stakeholder Management and Cross-functional Leadership are related PM
    // competencies, not aliases of each other - deliberately absent from
    // skillAliases. This is the guardrail the eval case's rationale documents.
    const job = buildJob({ techStackTags: ['Cross-functional Leadership'] });
    const result = service.score(job, { profile: buildProfile({ skills: ['Stakeholder Management'] }) });
    expect(result.skillOverlap).toBe(0);
  });

  it('reproduces the ai-pm-vocabulary-mismatch-de eval case: 2 of 4 canonicalized concepts overlap', () => {
    const job = buildJob({
      techStackTags: ['Cross-functional Leadership', 'Experimentation', 'Product Roadmap', 'Fintech'],
    });
    const result = service.score(job, {
      profile: buildProfile({ skills: ['Stakeholder Management', 'A/B Testing', 'Roadmapping', 'Fintech'] }),
    });
    // {stakeholder management, a/b testing, product roadmap, fintech} vs
    // {cross-functional leadership, experimentation, product roadmap, fintech}
    // -> 2 of the candidate's skills are evidenced by this job. 'A/B Testing'
    // does NOT canonicalize to 'Experimentation' (removed after adversarial
    // audit - see skillAliases' comment for why), so only the Roadmapping
    // pair collapses here, not both.
    //
    // Under the old Jaccard this was 2/6 (divided by the UNION); it's now
    // scored against a fixed evidence target instead, so the same two real
    // matches read higher. The count of matched concepts - the thing this
    // case actually pins down - is unchanged at 2.
    expect(result.skillOverlap).toBeCloseTo(2 / SKILL_EVIDENCE_TARGET);
  });

  it('is unaffected (no-op) for skills that are not in the alias table', () => {
    const job = buildJob({ techStackTags: ['Underwater Basket Weaving'] });
    const result = service.score(job, { profile: buildProfile({ skills: ['Underwater Basket Weaving'] }) });
    expect(result.skillOverlap).toBeCloseTo(1 / SKILL_EVIDENCE_TARGET);
  });
});

describe('RankingService.score - skill evidence from the job description', () => {
  const service = new RankingService();

  it('scores a non-tech job that has no techStackTags at all, from its description text', () => {
    // The case the old Jaccard could never score: extract_tech_stack_tags()
    // is a 53-entry English tech keyword regex, so a legal/marketing/nursing
    // posting gets zero tags and used to hit a hardcoded 0.1 floor no matter
    // how well it actually matched.
    const job = buildJob({
      techStackTags: [],
      jobTitleNormalized: 'legal counsel',
      jobDescriptionText:
        'You will advise on Contract Law and Intellectual Property Law, support Compliance reviews, ' +
        'handle Data Protection questions and manage external Litigation counsel.',
    });
    const result = service.score(job, {
      profile: buildProfile({
        targetRole: 'Legal Counsel',
        skills: ['Contract Law', 'Intellectual Property Law', 'Compliance', 'Data Protection', 'Litigation'],
      }),
    });
    expect(result.skillOverlap).toBe(1);
  });

  it('matches skills in a German-language description', () => {
    const job = buildJob({
      techStackTags: [],
      language: 'de',
      jobDescriptionText: 'Wir suchen Verstärkung mit fundierter Erfahrung in Kubernetes und Terraform.',
    });
    const result = service.score(job, { profile: buildProfile({ skills: ['Kubernetes', 'Terraform'] }) });
    expect(result.skillOverlap).toBeCloseTo(2 / SKILL_EVIDENCE_TARGET);
  });

  it('does NOT count generic soft skills as evidence, so a padded CV cannot match everything', () => {
    // The inverse failure mode of the bug being fixed: evidence counting
    // makes it cheap to score high, and a CV of nothing but generic
    // competencies would otherwise match essentially every posting in every
    // field. See SKILL_EVIDENCE_STOPLIST.
    const job = buildJob({
      jobDescriptionText:
        'A role requiring excellent Communication, strong Teamwork, Leadership, ' +
        'Project Management and Problem Solving skills.',
    });
    const result = service.score(job, {
      profile: buildProfile({
        skills: ['Communication', 'Teamwork', 'Leadership', 'Project Management', 'Problem Solving'],
      }),
    });
    expect(result.skillOverlap).toBe(0);
  });

  it('does not let a two-skill CV reach a perfect score just by matching both of them', () => {
    // Guards the fixed denominator: scaling the target down to the CV's own
    // length would make matching 2 of 2 look like stronger evidence than
    // matching 5 of 25, which is backwards.
    const job = buildJob({ techStackTags: ['typescript', 'docker'] });
    const result = service.score(job, { profile: buildProfile({ skills: ['typescript', 'docker'] }) });
    expect(result.skillOverlap).toBeCloseTo(2 / SKILL_EVIDENCE_TARGET);
    expect(result.skillOverlap!).toBeLessThan(1);
  });

  it('reports skillOverlap as null - not a low score - when the candidate has no skills recorded', () => {
    const result = service.score(buildJob({ techStackTags: ['typescript'] }), {
      profile: buildProfile({ skills: [] }),
    });
    expect(result.skillOverlap).toBeNull();
  });

  it('does not match a skill that only appears as a substring of a longer word', () => {
    const job = buildJob({ techStackTags: [], jobDescriptionText: 'Experience with javascripting frameworks.' });
    const result = service.score(job, { profile: buildProfile({ skills: ['Java'] }) });
    expect(result.skillOverlap).toBe(0);
  });

  it('matches multi-symbol skills that a naive word-boundary regex would miss', () => {
    const job = buildJob({ techStackTags: [], jobDescriptionText: 'Our stack is C++ and Node.js with CI/CD.' });
    const result = service.score(job, { profile: buildProfile({ skills: ['C++', 'Node.js', 'CI/CD'] }) });
    expect(result.skillOverlap).toBeCloseTo(3 / SKILL_EVIDENCE_TARGET);
  });
});

describe('RankingService.score - languageFit reads the candidate languages, not the UI language', () => {
  const service = new RankingService();

  it('credits a German-language posting for a German speaker whose interface language is English', () => {
    // The actual bug: preferredLanguage is the UI language. A candidate
    // fluent in German who reads the app in English scored a flat 0.5
    // against every German posting.
    const result = service.score(buildJob({ language: 'de' }), {
      profile: buildProfile({ preferredLanguage: 'en', languages: ['German', 'English'] }),
    });
    expect(result.languageFit).toBe(1);
  });

  it('parses proficiency qualifiers off a CV languages entry', () => {
    const result = service.score(buildJob({ language: 'de' }), {
      profile: buildProfile({ preferredLanguage: 'en', languages: ['Deutsch (C1)', 'English - fluent'] }),
    });
    expect(result.languageFit).toBe(1);
  });

  it('scores a genuine language gap low, not neutral', () => {
    const result = service.score(buildJob({ language: 'de' }), {
      profile: buildProfile({ preferredLanguage: 'de', languages: ['English'] }),
    });
    expect(result.languageFit).toBeCloseTo(0.25);
  });

  it('reports languageFit as null when the candidate has no languages recorded', () => {
    const result = service.score(buildJob({ language: 'de' }), {
      profile: buildProfile({ preferredLanguage: 'de', languages: [] }),
    });
    expect(result.languageFit).toBeNull();
  });
});

describe('RankingService.score - cityFit', () => {
  const service = new RankingService();

  const berliner = (overrides = {}) =>
    buildProfile({
      locationPreference: 'onsite',
      homeCity: 'Berlin',
      acceptableCities: [],
      relocationWillingness: 'no',
      ...overrides,
    });

  it('disqualifies an onsite job in a city the candidate will not move to', () => {
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Munich' });
    const result = service.score(job, { profile: berliner() });
    expect(result.cityFit).toBe('mismatch');
    expect(result.eligible).toBe(false);
  });

  it('treats an onsite job in the candidate home city as a match', () => {
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Berlin' });
    const result = service.score(job, { profile: berliner() });
    expect(result.cityFit).toBe('match');
    expect(result.eligible).toBe(true);
  });

  it('resolves German city spellings through the market pack dictionary', () => {
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Munich' });
    const result = service.score(job, { profile: berliner({ homeCity: 'München' }) });
    expect(result.cityFit).toBe('match');
  });

  it('ignores city entirely for a remote job', () => {
    const job = buildJob({ remoteType: 'remote', locationNormalized: 'Munich' });
    const result = service.score(job, { profile: berliner({ locationPreference: 'remote' }) });
    expect(result.cityFit).toBe('not_applicable');
    expect(result.eligible).toBe(true);
  });

  it('keeps a wrong-city job eligible but discounted when the candidate would relocate', () => {
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Munich' });
    const willing = service.score(job, { profile: berliner({ relocationWillingness: 'within_country' }) });
    const athome = service.score(buildJob({ remoteType: 'onsite', locationNormalized: 'Berlin' }), {
      profile: berliner(),
    });
    expect(willing.cityFit).toBe('relocation_required');
    expect(willing.eligible).toBe(true);
    expect(willing.locationFit).toBeLessThan(athome.locationFit);
  });

  it('stays dormant for a profile with no city recorded, so existing users are unaffected', () => {
    // Every profile predating these columns is empty. City scoring must not
    // start disqualifying jobs for people who were never asked the question.
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Munich' });
    const result = service.score(job, {
      profile: buildProfile({ locationPreference: 'onsite', homeCity: null, acceptableCities: [] }),
    });
    expect(result.cityFit).toBe('unknown');
    expect(result.eligible).toBe(true);
    expect(result.locationFit).toBe(1);
  });

  it('accepts a secondary city from acceptableCities, not just the home city', () => {
    const job = buildJob({ remoteType: 'onsite', locationNormalized: 'Hamburg' });
    const result = service.score(job, { profile: berliner({ acceptableCities: ['Hamburg'] }) });
    expect(result.cityFit).toBe('match');
  });
});

describe('RankingService.score - conservative title word aliasing (titleAliases)', () => {
  const service = new RankingService();

  // Every surviving pair is a cross-industry-unambiguous seniority/role-suffix
  // abbreviation - see market-de's titleAliases comment for what was tried
  // and rejected (developer/dev/programmer/coder/eng -> engineer) and why.
  const TITLE_ALIAS_PAIRS: [string, string][] = [
    ['Sr', 'Senior'],
    ['Jr', 'Junior'],
    ['Mgr', 'Manager'],
    ['Exec', 'Executive'],
    ['Coord', 'Coordinator'],
    ['Rep', 'Representative'],
  ];

  it.each(TITLE_ALIAS_PAIRS)('treats "%s" and "%s" as the same title token despite zero literal overlap', (alias, canonical) => {
    const job = buildJob({ jobTitleNormalized: canonical });
    const result = service.score(job, { profile: buildProfile({ targetRole: alias }) });
    expect(result.titleSimilarity).toBe(1);
  });

  // Real Estate Developer/Medical Coder/Film Programmer vs Software Engineer
  // are now covered once, exhaustively, by the TITLE_NEGATIVE_PAIRS-driven
  // test in the describe block below, rather than duplicated here.

  it('is unaffected (no-op) for words that are not in the alias table', () => {
    const job = buildJob({ jobTitleNormalized: 'Grommet Inspector' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Grommet Inspector' }) });
    expect(result.titleSimilarity).toBe(1);
  });
});

describe('RankingService.score - phrase-level title-equivalence classes (Gate 2 rev B)', () => {
  const service = new RankingService();

  // The gap the titleAliases describe block above documents as "known and
  // intentional" (bare-word aliasing can't safely close it) is closed here
  // by a different mechanism: a class matches the FULL phrase, so it can
  // never fire on 'Real Estate Developer' or 'Business Developer' the way a
  // 'developer' -> 'engineer' word alias would have. See market-de's
  // titleEquivalenceClasses comment for the full rationale (this replaced an
  // ESCO-based Tier 2 resolution mechanism that measurement showed doesn't
  // catalog this platform's actual title vocabulary).
  const SOFTWARE_ENGINEER_CLASS_MEMBERS = [
    'Software Engineer',
    'Software Developer',
    'Full-Stack Developer',
    'Fullstack Developer',
    'Softwareentwickler',
    'Anwendungsentwickler',
  ];

  it.each(SOFTWARE_ENGINEER_CLASS_MEMBERS)(
    'plan.md Phase 4b\'s named example is now closed: "%s" scores a perfect title match against "Software Engineer"',
    (member) => {
      const job = buildJob({ jobTitleNormalized: member });
      const result = service.score(job, { profile: buildProfile({ targetRole: 'Software Engineer' }) });
      expect(result.titleSimilarity).toBe(1);
    },
  );

  it('matches the German masculine/feminine slash convention without a dedicated combined-form entry', () => {
    const job = buildJob({ jobTitleNormalized: 'Softwareentwickler/Softwareentwicklerin' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Software Engineer' }) });
    expect(result.titleSimilarity).toBe(1);
  });

  it('matches regardless of hyphenation/case/whitespace variation in the input', () => {
    const job = buildJob({ jobTitleNormalized: '  FULL-STACK   Developer ' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'software engineer' }) });
    expect(result.titleSimilarity).toBe(1);
  });

  // Two representative end-to-end checks (via the real score() pipeline,
  // not just the pure resolver) - the exhaustive, corpus-driven safety net
  // is the it.each below, in its own describe block.
  it('does not class-match "Business Development Manager" with the software-engineer class\'s "Full Stack Developer" collision job', () => {
    // Mirrors Gate 1's sales-gate1-1 two-sided "Developer" test: "full stack
    // developer" is a real collision against a Business Development
    // Manager candidate, not a synonym, despite the shared word "developer".
    const job = buildJob({ jobTitleNormalized: 'full stack developer' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Business Development Manager' }) });
    expect(result.titleSimilarity).toBe(0);
  });

  it('does not let "Real Estate Developer" join the software-engineer class', () => {
    const job = buildJob({ jobTitleNormalized: 'real estate developer' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Software Engineer' }) });
    expect(result.titleSimilarity).toBe(0);
  });

  it('does not let "Applikationsentwickler" join the software-engineer class despite its near-homograph "Anwendungsentwickler" being a member', () => {
    // A live curation-queue proposal suggested both terms at once (0.8
    // confidence, same LLM call). The 5-lens audit split 3-2: two lenses
    // independently found "Applikationsentwickler" also names a real,
    // unrelated chemistry/materials-science role and clusters in SAP/ERP
    // support-hybrid postings - see TITLE_NEGATIVE_PAIRS. Its near-homograph
    // carries no such collision and was added above.
    const job = buildJob({ jobTitleNormalized: 'Applikationsentwickler' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Software Engineer' }) });
    expect(result.titleSimilarity).toBe(0);
  });

  it('does not let an unrelated hybrid title reach a class through a generic slash split', () => {
    // The gender-pair slash handling (below) must not become a generic
    // slash-split - that would let "business developer" reach the
    // software-engineer class merely by riding alongside "software
    // developer" after a slash, through a door the negative-pair suite
    // above doesn't cover. Guarded by requiring one segment to be a prefix
    // of the other (true of gender pairs, false here).
    const job = buildJob({ jobTitleNormalized: 'Business Developer / Software Developer' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Business Development Manager' }) });
    expect(result.titleSimilarity).toBeLessThan(1);
  });

  it('falls through unchanged to plain Jaccard when neither title matches any class', () => {
    const job = buildJob({ jobTitleNormalized: 'Grommet Inspector' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Senior Grommet Inspector' }) });
    // {senior, grommet, inspector} vs {grommet, inspector} -> intersection 2, union 3.
    expect(result.titleSimilarity).toBeCloseTo(2 / 3);
  });
});

describe('RankingService.score - PR3 zero-overlap-query candidate classes (7 added, 2 rejected after a second 5-lens audit)', () => {
  const service = new RankingService();

  // Each pair below is the exact zero-token-overlap pair that motivated the
  // class, per-class - a real regression pin, not a generic smoke test.
  const CLASS_PAIRS: Array<[string, string]> = [
    ['Unternehmensjurist', 'Justiziar'],
    ['Copywriter', 'Werbetexter'],
    ['Sales Representative', 'Handelsvertreter'],
    ['Personalreferent', 'HR Generalist'],
    ['Bilanzbuchhalter', 'General Ledger Accountant'],
    ['Gesundheits- und Krankenpfleger', 'Pflegefachkraft Akutstation'],
    ['Kundenservice-Mitarbeiter', 'Servicefachkraft für Dialogmarketing'],
  ];

  it.each(CLASS_PAIRS)('scores a perfect title match between "%s" and "%s"', (targetRole, jobTitle) => {
    const job = buildJob({ jobTitleNormalized: jobTitle.toLowerCase() });
    const result = service.score(job, { profile: buildProfile({ targetRole }) });
    expect(result.titleSimilarity).toBe(1);
  });

  it('does not let bare "Texter" reach the copywriter class - only "Werbetexter" was audited safe', () => {
    // 5/5 drop on bare "Texter" (real Liedtexter/Videotexter collision) -
    // this must keep falling through to plain Jaccard, not silently start
    // matching once "Werbetexter" exists in the same class.
    const job = buildJob({ jobTitleNormalized: 'texter' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Copywriter' }) });
    expect(result.titleSimilarity).toBe(0);
  });

  it('does not let bare "Pflegefachkraft" reach the registered-nurse class - only the qualified "Akutstation" form was audited safe', () => {
    // 4/5 drop on the bare umbrella term (real acute-vs-geriatric-care
    // over-collapse risk) - the qualified member must not accidentally
    // widen to match the bare form too.
    const job = buildJob({ jobTitleNormalized: 'pflegefachkraft' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Gesundheits- und Krankenpfleger' }) });
    expect(result.titleSimilarity).toBe(0);
  });

  it('does not add a qa-engineer class - bare "QA Engineer" failed its own audit (real aerospace/automotive QA collision)', () => {
    const job = buildJob({ jobTitleNormalized: 'softwaretester' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'QA Engineer' }) });
    expect(result.titleSimilarity).toBeLessThan(1);
  });

  it('does not add a product-owner class - the qualified "Produktmanager - Digitale Kundenprodukte" phrase still failed its audit (disambiguates industry, not Scrum-vs-strategic function)', () => {
    const job = buildJob({ jobTitleNormalized: 'produktmanager - digitale kundenprodukte' });
    const result = service.score(job, { profile: buildProfile({ targetRole: 'Product Owner' }) });
    expect(result.titleSimilarity).toBeLessThan(1);
  });
});

describe('RankingService - TITLE_NEGATIVE_PAIRS corpus invariant', () => {
  // The exhaustive, future-proof safety net the Gate 2 rev B design law (§0)
  // requires: every pair this session's audits confirmed are DIFFERENT
  // occupations must never resolve to the same titleEquivalenceClasses
  // entry, no matter how many classes exist. Unlike the score()-level tests
  // above, this operates on the pure resolver directly and automatically
  // covers every class ever added, present or future - a new class that
  // accidentally reunites a known collision fails here immediately, without
  // needing a hand-written test for that specific class.
  it.each(TITLE_NEGATIVE_PAIRS)('never places "$a" and "$b" in the same title-equivalence class ($reason)', ({ a, b }) => {
    const classA = resolveTitleEquivalenceClassId(a, titleEquivalenceIndex);
    const classB = resolveTitleEquivalenceClassId(b, titleEquivalenceIndex);
    if (classA !== null && classB !== null) {
      expect(classA).not.toBe(classB);
    }
  });
});
