import { normalizeFullTitle } from './title-matching.js';

/**
 * The enumerable false-positive surface the Gate 2 rev B design law (see
 * titleEquivalenceClasses' comment in index.ts) requires: every pair of
 * title phrases this session's audits have already confirmed name DIFFERENT
 * occupations, despite sharing a word, an acronym, or a broad field with
 * each other. No two phrases in the same pair may ever end up in the same
 * titleEquivalenceClasses entry - either because a future class addition
 * would create a real cross-field collision, or because it would collapse a
 * genuine seniority/scope gap into a same-occupation claim.
 *
 * Sourced from two places, not invented for this file:
 * - titleAliases' own audit (packages/market-de's comment on that table):
 *   'developer'/'dev'/'programmer'/'coder'/'eng' -> 'engineer' were all
 *   rejected, each for a specific named collision.
 * - Gate 1's adjudicated hard negatives (apps/api/src/jobs/eval/dataset/
 *   gate1-queries.ts), which concretize the same collision families as real
 *   graded job pairs, plus a few additional families titleAliases' word-level
 *   audit never had occasion to name (acronym collisions like NLP/SEM/CRO/QA,
 *   and broader-vs-narrower scope pairs like P&L/EMR-EHR/GDPR).
 *
 * This is the corpus the curation engine (see curation-engine.ts) screens
 * every LLM-proposed class assignment against before it can even reach a
 * human reviewer - a proposal that would place both members of any pair
 * below into the same class is auto-rejected, not queued.
 */
export interface TitleNegativePair {
  a: string;
  b: string;
  /** Why these are confirmed NOT the same occupation - the audit trail a curator or the screening engine can point to. */
  reason: string;
}

export const TITLE_NEGATIVE_PAIRS: TitleNegativePair[] = [
  // --- 'developer'/'engineer' word-collision family (titleAliases audit) ---
  {
    a: 'Software Engineer',
    b: 'Real Estate Developer',
    reason:
      "The flagship collision from Gate 0/titleAliases' audit: shares the register 'Developer'/'Engineer' with zero real occupational overlap - property development vs. software engineering.",
  },
  {
    a: 'Software Engineer',
    b: 'Business Developer',
    reason: "'Developer' also names a real, unrelated sales/BD title - titleAliases' audit rejected 'developer' -> 'engineer' specifically because of this.",
  },
  {
    a: 'Business Development Manager',
    b: 'Full Stack Developer',
    reason:
      "Gate 1's sales-gate1-1 two-sided 'Developer' test: a real collision against a Business Development Manager candidate, not a synonym, despite the shared word 'developer'.",
  },
  {
    a: 'Software Engineer',
    b: 'Medical Coder',
    reason: "'Coder' names a medical-billing/claims-coding role (ICD-10/OPS), not a software-engineering one - titleAliases' audit rejected 'coder' -> 'engineer' for this reason.",
  },
  {
    a: 'Software Engineer',
    b: 'Film Programmer',
    reason: "'Programmer' also names arts/media festival-programming curation - titleAliases' audit rejected 'programmer' -> 'engineer' for this reason.",
  },
  {
    a: 'Content Marketing Manager',
    b: 'Film Programmer',
    reason: 'Gate 1 marketing-gate1-2: shares only the surface word register with a marketing role, curates a film festival programme, not marketing content.',
  },
  {
    a: 'Software Engineer',
    b: 'VP of Engineering',
    reason:
      "Seniority/scope collapse, not a field collision: 'eng' word-level aliasing was rejected because a leadership title ('VP of Eng', 'Head of Eng') would falsely IC-match. A phrase class must not reintroduce this at the full-title level either.",
  },

  // --- Acronym-collision family (Gate 1 hard negatives) ---
  {
    a: 'Machine-Learning-Ingenieur:in',
    b: 'NLP-Trainerin (Neurolinguistisches Programmieren)',
    reason: "Gate 1 tech-gate1-2: 'NLP' here is Neuro-Linguistic Programming (a coaching credential), not Natural Language Processing/Machine Learning.",
  },
  {
    a: 'Performance Marketing Manager',
    b: 'Quantitative Research Analyst',
    reason: "Gate 1 marketing-gate1-1: 'SEM' collision - Structural Equation Modeling (a statistics/research technique) vs. Search Engine Marketing.",
  },
  {
    a: 'Vertriebsleiter E-Commerce',
    b: 'Chief Revenue Officer',
    reason: "Gate 1 sales-gate1-2: 'CRO' collision (Conversion Rate Optimization skill vs. Chief Revenue Officer title) compounded with a genuine C-suite seniority/scope gap.",
  },
  {
    a: 'Customer Support Specialist',
    b: 'QA Engineer (Test Automation)',
    reason: "Gate 1 customer-support-gate1-1: 'QA' collision - call-quality monitoring vs. automated software test engineering.",
  },
  {
    a: 'Personalreferent',
    b: 'Product Manager - User Onboarding',
    reason: "Gate 1 HR-gate1-1: 'Onboarding' collision - product/customer onboarding (a PM/CS skill) vs. employee onboarding (HR's).",
  },
  {
    a: 'Legal Counsel',
    b: 'SOC2 Compliance Analyst',
    reason: "Gate 1 legal-gate1-1: 'Compliance' collision - IT/security-audit compliance (SOC2 controls) vs. legal/contract compliance.",
  },
  {
    a: 'Softwareentwickler Digital Health',
    b: 'Medical Coder',
    reason: "Gate 1 healthcare-gate1-2: 'Coder' collision - medical billing/claims coding (ICD-10-GM, OPS) vs. software engineering, same family as the Real Estate/Film Programmer pairs above.",
  },
  {
    a: 'Financial Analyst (FP&A)',
    b: 'Sales Operations Analyst',
    reason: "Gate 1 finance-gate1-1: 'Forecasting' collision - CRM deal-stage pipeline forecasting (sales ops) vs. financial forecasting.",
  },

  // --- Broader-vs-narrower scope family (over-collapse, not a field collision) ---
  {
    a: 'Growth Product Manager',
    b: 'Experimentation Platform Manager',
    reason:
      "Gate 1 product-management-gate1-1: same broad discipline, but owning a company's entire experimentation platform is a materially broader mandate than a candidate's single A/B-testing skill - the same technique-vs-discipline over-collapse that killed skillAliases' 'a/b testing' -> 'experimentation' entry.",
  },
  {
    a: 'Senior Produktmanager',
    b: 'Teamleiter Produktentwicklung',
    reason:
      "Gate 1 product-management-gate1-2 (adjudicated): 'Produktentwicklung' reads as engineering/R&D leadership in the German market, not product management, despite the shared 'Produkt' root.",
  },
  {
    a: 'Datenschutzbeauftragter',
    b: 'Global Privacy & Data Protection Counsel',
    reason:
      "Gate 1 legal-gate1-2: requires multi-jurisdiction (EU/US/APAC) data-protection expertise, a broader mandate than a GDPR-only DPO background - the same broader-vs-narrower pattern that killed skillAliases' 'gdpr' -> 'data protection' entry.",
  },
  {
    a: 'Health Information Technician',
    b: 'EHR Interoperability Specialist',
    reason:
      "Gate 1 healthcare-gate1-1: requires true cross-network EHR/HL7/FHIR interoperability experience, a formally broader skillset than single-practice EMR use - the exact EMR-vs-EHR distinction that killed skillAliases' 'emr' -> 'electronic health records' entry.",
  },
  {
    a: 'Finanzanalyst (Controlling)',
    b: 'Bereichsleiter mit P&L-Verantwortung',
    reason:
      "Gate 1 finance-gate1-2: full P&L decision authority for a business unit is a genuine function/seniority gap from P&L statement-reading and reporting - the same pattern that killed skillAliases' bare 'p&l' entry.",
  },
  {
    a: 'Vertriebsleiter E-Commerce',
    b: 'Geschäftsführer Vertrieb',
    reason: 'Gate 1 sales-gate1-2: C-suite, full-P&L authority over the whole company vs. a department-head Vertriebsleiter role - same family as the VP of Engineering seniority-collapse case above.',
  },

  // --- Curation-engine audit findings (post-PR2, first real curated batch) ---
  {
    a: 'Software Engineer',
    b: 'Applikationsentwickler',
    reason:
      "5-lens audit of a live curation-queue proposal (0.8 confidence) split 3-2: two independent lenses (cross-category collision hunter, real-world usage) found 'Applikationsentwickler' also names a real, unrelated chemistry/materials-science role (adhesives/coatings/pharma 'Anwendungstechnik' formulation work, requiring a chemistry background, not coding) and disproportionately clusters in SAP/ERP-customization and support-hybrid postings when used in a software context - unlike its near-homograph 'anwendungsentwickler', which was added to the software-engineer class 5/0. Same shape as the Real Estate Developer/Medical Coder collisions: identical surface string, unconnected occupation.",
  },
];

/**
 * Returns the violated pair if phraseA/phraseB (in either order) match a
 * confirmed-distinct pair above, or null if they don't. Compares after
 * normalizeFullTitle so callers can pass raw, human-typed text - the corpus
 * above is deliberately stored in readable form, not pre-normalized.
 */
export function violatesNegativePair(phraseA: string, phraseB: string, pairs: TitleNegativePair[] = TITLE_NEGATIVE_PAIRS): TitleNegativePair | null {
  const na = normalizeFullTitle(phraseA);
  const nb = normalizeFullTitle(phraseB);
  for (const pair of pairs) {
    const pa = normalizeFullTitle(pair.a);
    const pb = normalizeFullTitle(pair.b);
    if ((na === pa && nb === pb) || (na === pb && nb === pa)) return pair;
  }
  return null;
}
