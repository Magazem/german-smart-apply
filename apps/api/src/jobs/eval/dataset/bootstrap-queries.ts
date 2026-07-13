import type { CanonicalJob } from '@german-smart-apply/shared';
import type { LabeledQuery } from '../types.js';
import { buildEvalJob, buildEvalProfile } from './fixtures.js';

/**
 * Phase 3b LLM-judge-bootstrapped eval corpus - the real matching-quality
 * ground truth the ranking-eval harness measures against, as opposed to the
 * tiny hand-written smoke set in queries.ts.
 *
 * Provenance and method:
 *  - Jobs are 14 REAL, live-fetched postings (Greenhouse in-house boards and
 *    the Arbeitsagentur federal job board), used with their real title,
 *    company, location, and description. Only fields the source did not state
 *    explicitly (techStackTags inferred from the description, remoteType,
 *    salary when no figure is given) were filled in with conservative
 *    real-world judgment - never inventing precision the source lacked, per
 *    the anti-fabrication stance in packages/ai/src/anthropic-provider.ts.
 *  - Profiles are representative SYNTHETIC candidate archetypes, one per
 *    common field in the German market.
 *  - Relevance grades were assigned by an independent Claude Opus 4.8 judge
 *    (labeledBy below), graded from scratch on genuine role / skill / domain /
 *    seniority fit - not on company prestige or tech-adjacency. The corpus is
 *    deliberately built so a candidate's own field outranks unrelated fields
 *    even on messy real postings, and so "same role, different company type"
 *    pairs (data analyst, marketing, legal) are graded on fit alone.
 *
 * The same real job legitimately appears in several queries with different
 * grades - relevance is relative to each candidate, not a property of the job.
 */

const jobBackendN26: CanonicalJob = buildEvalJob({
  jobId: 'gh_backend_n26',
  sourceType: 'greenhouse',
  sourceUrl: 'https://n26.com/en-eu/careers/positions/8035334?gh_jid=8035334',
  applyUrl: 'https://n26.com/en-eu/careers/positions/8035334?gh_jid=8035334',
  companyNameRaw: 'N26',
  companyNameNormalized: 'n26',
  jobTitleRaw: 'Backend Engineer — Core Systems',
  jobTitleNormalized: 'backend engineer core systems',
  jobDescriptionText:
    "N26's Bank Core team owns the systems at the heart of the bank - accounts, ledgers, and the core banking logic every other team builds on. Services are written almost exclusively in Kotlin on Spring Boot, deployed on Kubernetes, communicating over Kafka, backed by Postgres, and running on AWS. You own features end to end on systems that move real money for millions of customers. Requires a solid grasp of microservice architecture, relational databases (Postgres preferred), and experience in a modern cloud environment (ideally AWS and Kubernetes).",
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  techStackTags: ['Kotlin', 'Spring Boot', 'Kubernetes', 'Kafka', 'PostgreSQL', 'AWS', 'Microservices'],
});

const jobFullstackContentful: CanonicalJob = buildEvalJob({
  jobId: 'gh_fullstack_contentful',
  sourceType: 'greenhouse',
  sourceUrl: 'https://job-boards.greenhouse.io/contentful/jobs/7557597',
  applyUrl: 'https://job-boards.greenhouse.io/contentful/jobs/7557597',
  companyNameRaw: 'Contentful',
  companyNameNormalized: 'contentful',
  jobTitleRaw: 'Fullstack Software Engineer (f/m/d)',
  jobTitleNormalized: 'fullstack software engineer',
  jobDescriptionText:
    'Join Contentful as a Fullstack Software Engineer building scalable automation, workflow, and collaboration features. Design, develop, and maintain frontend and backend features using TypeScript, React, and Node.js. Requires strong skills in TypeScript, React, and Node.js, experience with Docker and Kubernetes, and familiarity with a cloud platform (AWS, Azure, or GCP).',
  language: 'en',
  locationRaw: 'Berlin, Germany',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  techStackTags: ['TypeScript', 'React', 'Node.js', 'Docker', 'Kubernetes', 'AWS'],
});

const jobDataAnalystGyg: CanonicalJob = buildEvalJob({
  jobId: 'gh_dataanalyst_gyg',
  sourceType: 'greenhouse',
  sourceUrl: 'https://getyourguide.careers/jobs/7962548?gh_jid=7962548',
  applyUrl: 'https://getyourguide.careers/jobs/7962548?gh_jid=7962548',
  companyNameRaw: 'GetYourGuide',
  companyNameNormalized: 'getyourguide',
  jobTitleRaw: 'Senior Data Analyst, Customer Care Analytics',
  jobTitleNormalized: 'senior data analyst customer care analytics',
  jobDescriptionText:
    "GetYourGuide is hiring a Senior Data Analyst for Customer Care Analytics. You own Care's strategic analytics backlog, build measurement frameworks (metrics, models, dashboards), and deliver deep-dive modeling on contacts, refunds, CSAT, and channel performance. Requires 5+ years in an analytics or data-science role, production-grade SQL, strong working knowledge of Python, and hands-on experimentation and statistics.",
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'senior',
  techStackTags: ['SQL', 'Python', 'Statistics', 'Experimentation', 'Dashboards', 'Data Modeling'],
});

const jobPmN26: CanonicalJob = buildEvalJob({
  jobId: 'gh_pm_n26',
  sourceType: 'greenhouse',
  sourceUrl: 'https://n26.com/en-eu/careers/positions/7140058?gh_jid=7140058',
  applyUrl: 'https://n26.com/en-eu/careers/positions/7140058?gh_jid=7140058',
  companyNameRaw: 'N26',
  companyNameNormalized: 'n26',
  jobTitleRaw: 'Senior Product Manager - Payment Processing & Settlement',
  jobTitleNormalized: 'senior product manager payment processing settlement',
  jobDescriptionText:
    'N26 is hiring a Senior Product Manager for Payment Processing & Settlement. You own the product lifecycle for scheme integrations and core payment platform components (SEPA, SWIFT, APMs), define and drive the roadmap, and work cross-functionally with Compliance, Treasury, Operations, and Finance. Requires 5+ years in product management (ideally fintech, banking, or PSP), hands-on experience with payment scheme integrations, and strong stakeholder management.',
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'senior',
  techStackTags: ['Product Management', 'Payments', 'SEPA', 'SWIFT', 'Stakeholder Management', 'Fintech', 'Agile'],
});

const jobMarketingN26: CanonicalJob = buildEvalJob({
  jobId: 'gh_marketing_n26',
  sourceType: 'greenhouse',
  sourceUrl: 'https://n26.com/en-eu/careers/positions/7845570?gh_jid=7845570',
  applyUrl: 'https://n26.com/en-eu/careers/positions/7845570?gh_jid=7845570',
  companyNameRaw: 'N26',
  companyNameNormalized: 'n26',
  jobTitleRaw: 'Influencer & Affiliate Marketing Manager',
  jobTitleNormalized: 'influencer affiliate marketing manager',
  jobDescriptionText:
    'N26 is hiring a Senior Specialist, Affiliate & Influencers to lead expansion in the Spanish market. You define and execute the affiliate and influencer marketing strategy, manage the Spanish network end to end (pipeline, relationships, negotiation, performance optimization), and run data-driven analysis on acquisition rates, costs, profitability, and retention. Requires 5+ years in performance marketing, strong analytics, and partnership/negotiation skills.',
  language: 'en',
  // Real posting is based in Madrid - countryCode is ES, not the DE default,
  // because claiming DE for a Spanish-market role would be a fabrication. This
  // makes the location an honest confound in the marketing test case below.
  locationRaw: 'Madrid',
  locationNormalized: 'Madrid',
  countryCode: 'ES',
  remoteType: 'hybrid',
  seniority: 'senior',
  techStackTags: [
    'Performance Marketing',
    'Affiliate Marketing',
    'Influencer Marketing',
    'User Acquisition',
    'Analytics',
    'Campaign Management',
  ],
});

const jobLegalGyg: CanonicalJob = buildEvalJob({
  jobId: 'gh_legal_gyg',
  sourceType: 'greenhouse',
  sourceUrl: 'https://getyourguide.careers/jobs/7837883?gh_jid=7837883',
  applyUrl: 'https://getyourguide.careers/jobs/7837883?gh_jid=7837883',
  companyNameRaw: 'GetYourGuide',
  companyNameNormalized: 'getyourguide',
  jobTitleRaw: 'Senior Legal Counsel - Data, Privacy & AI',
  jobTitleNormalized: 'senior legal counsel data privacy ai',
  jobDescriptionText:
    'GetYourGuide is hiring a Senior Legal Counsel for Data, Privacy & AI. A pragmatic in-house counsel role: you own core data-protection operations (Data Subject Requests, Records of Processing Activities, DPIAs, retention), set privacy standards, and review and negotiate SaaS, vendor, and AI-tool agreements as part of procurement legal review, embedding privacy-by-design and compliance into product development.',
  language: 'en',
  locationRaw: 'Berlin',
  locationNormalized: 'Berlin',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'senior',
  techStackTags: ['Contract Law', 'Compliance', 'Negotiation', 'Data Protection', 'GDPR', 'Privacy'],
});

const jobLegalBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_legal',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003086694-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003086694-S',
  companyNameRaw: 'Novak Pavlo Rechtsanwalt',
  companyNameNormalized: 'novak pavlo rechtsanwalt',
  jobTitleRaw: 'Rechtsanwalt (m/w/d)',
  jobTitleNormalized: 'rechtsanwalt',
  jobDescriptionText:
    'Zur Verstärkung einer spezialisierten Fachanwaltskanzlei wird eine Rechtsanwältin bzw. ein Rechtsanwalt (m/w/d) im Bereich Verkehrsrecht (überwiegend Unfallregulierung) gesucht. Aufgaben: eigenständige Mandantenbetreuung und -beratung, außergerichtliche und gerichtliche Vertretung, Bearbeitung von Verkehrsunfällen, Bußgeldverfahren und Führerscheinangelegenheiten, Erstellung von Schriftsätzen sowie Teilnahme an Gerichtsterminen. Auch Berufsanfänger willkommen.',
  language: 'de',
  locationRaw: 'Nürnberg',
  locationNormalized: 'Nürnberg',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'junior',
  techStackTags: ['Verkehrsrecht', 'Unfallregulierung', 'Prozessführung', 'Mandantenbetreuung'],
});

const jobMarketingBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_marketing',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003270722-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003270722-S',
  companyNameRaw: 'Josef WITT GmbH',
  companyNameNormalized: 'josef witt gmbh',
  jobTitleRaw: 'Marketing Manager (m/w/d)',
  jobTitleNormalized: 'marketing manager',
  jobDescriptionText:
    'Als Onsite Marketing Manager (m/w/d) im Bereich Product Content & Experience gestaltest du die digitale Customer Journey der Online-Shops: Optimierung von Shop-Navigation und Filterfunktionen, datenbasierte Verbesserung der Produkt- und Bilddatenqualität sowie regelmäßige Analyse von Performance-Daten (Navigationsnutzung, Filter-Conversions). Enge Zusammenarbeit mit Vertrieb, Einkauf und Branding im E-Commerce-Umfeld.',
  language: 'de',
  locationRaw: 'Weiden in der Oberpfalz',
  locationNormalized: 'Weiden in der Oberpfalz',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  techStackTags: ['Onsite-Marketing', 'E-Commerce', 'Performance Marketing', 'Datenanalyse', 'Analytics', 'Product Content'],
});

const jobSalesBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_sales',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1002362898-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1002362898-S',
  companyNameRaw: 'Sweco',
  companyNameNormalized: 'sweco',
  jobTitleRaw: 'Vertriebsmitarbeiter (m/w/d)',
  jobTitleNormalized: 'vertriebsmitarbeiter',
  jobDescriptionText:
    'Für den technischen Vertrieb im Bereich Straßeninfrastruktur (Sweco, Vermittlung über GSA) wird ein Vertriebsmitarbeiter (m/w/d) gesucht. Aufgaben: Entwicklung und Umsetzung strategischer Vertriebspläne, Analyse von Markt- und Kundenpotenzialen, Aufbau langfristiger Kundenbeziehungen (u. a. zu Kommunen), Präsentation technischer Softwarelösungen sowie Verantwortung für den gesamten Vertriebsprozess vom Erstkontakt bis zum Vertragsabschluss. Arbeit flexibel im Homeoffice.',
  language: 'de',
  locationRaw: 'Weimar',
  locationNormalized: 'Weimar',
  countryCode: 'DE',
  remoteType: 'remote',
  seniority: 'senior',
  techStackTags: ['B2B-Vertrieb', 'Kundenbeziehungen', 'Verhandlung', 'Vertriebsstrategie', 'Neukundengewinnung', 'Präsentation'],
});

const jobHrBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_hr',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12288-4887084764-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12288-4887084764-S',
  companyNameRaw: 'DIS AG',
  companyNameNormalized: 'dis ag',
  jobTitleRaw: 'Personalreferent (w/m/d)',
  jobTitleNormalized: 'personalreferent',
  jobDescriptionText:
    'Für ein Kundenunternehmen in der Region Helmstedt wird ein Personalreferent (m/w/d) in direkter Personalvermittlung gesucht. Aufgaben: Erstellung, Anpassung und Verwaltung von Arbeitsverträgen und personalrelevanten Dokumenten, Sicherstellung rechtssicherer HR-Prozesse, Pflege von Personalstammdaten und HR-Systemen. Profil: mehrjährige Erfahrung in der Personaladministration, Kenntnisse im Arbeits-, Sozialversicherungs- und Betriebsverfassungsrecht, sicherer Umgang mit SAP HCM. Jahresgehalt ca. 55.000 € je nach Qualifikation.',
  language: 'de',
  locationRaw: 'Helmstedt',
  locationNormalized: 'Helmstedt',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  // The only posting in the pool that states a figure ("ca. 55.000 €"); kept as
  // an approximate point estimate rather than inventing a band width.
  salaryMin: 55000,
  salaryMax: 55000,
  salaryCurrency: 'EUR',
  techStackTags: ['SAP HCM', 'Personaladministration', 'Arbeitsrecht', 'Sozialversicherungsrecht', 'MS Office'],
});

const jobFinanceBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_finance',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12633-fd634527_JB5195151-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12633-fd634527_JB5195151-S',
  companyNameRaw: 'DIS AG',
  companyNameNormalized: 'dis ag',
  jobTitleRaw: 'Buchhalter (m/w/d)',
  jobTitleNormalized: 'buchhalter',
  jobDescriptionText:
    'Erfahrener Buchhalter (m/w/d) im Rahmen der Arbeitnehmerüberlassung. Aufgaben: systematische Erfassung von Geschäftsvorfällen, Erstellung von Monats-, Quartals- und Jahresbilanzen, Überwachung von Einnahmen und Ausgaben, Verwaltung von Rechnungsein- und -ausgängen sowie Lohn- und Gehaltsabrechnung. Profil: abgeschlossene kaufmännische Ausbildung, fundierte Kenntnisse im Rechnungswesen und in Buchhaltungssoftware, gute MS-Office-Kenntnisse.',
  language: 'de',
  locationRaw: 'Murr',
  locationNormalized: 'Murr',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  techStackTags: ['Buchhaltung', 'Rechnungswesen', 'Bilanzierung', 'Buchhaltungssoftware', 'Lohnabrechnung', 'MS Office'],
});

const jobHealthcareBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_healthcare',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/20342-412-1783948561-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/20342-412-1783948561-S',
  companyNameRaw: 'DRK-Region Hannover e.V.',
  companyNameNormalized: 'drk-region hannover e.v.',
  jobTitleRaw: 'Pflegefachkraft (m/w/d)',
  jobTitleNormalized: 'pflegefachkraft',
  jobDescriptionText:
    'Pflegefachkraft (m/w/d) beim Deutschen Roten Kreuz in der Region Hannover. Wertegeleitete, wertschätzende Pflege von Menschen zuhause in verschiedenen Lebenslagen, eingebunden in ein multiprofessionelles Team, mit strukturierter Einarbeitung und regelmäßigen Fortbildungen. Voraussetzung: abgeschlossene Ausbildung als Pflegefachkraft oder vergleichbar, Einfühlungsvermögen und Zuverlässigkeit; Führerschein der Klasse B wünschenswert.',
  language: 'de',
  locationRaw: 'Hannover',
  locationNormalized: 'Hannover',
  countryCode: 'DE',
  remoteType: 'onsite',
  seniority: 'mid',
  techStackTags: ['Pflege', 'Patientenbetreuung', 'Ambulante Pflege', 'Pflegefachkraft'],
});

const jobSupportBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_support',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003365558-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1003365558-S',
  companyNameRaw: 'Volksbank Ulm-Biberach eG',
  companyNameNormalized: 'volksbank ulm-biberach eg',
  jobTitleRaw: 'Kundenservice (m/w/d)',
  jobTitleNormalized: 'kundenservice',
  jobDescriptionText:
    'Serviceberater (m/w/d) im Kundenservice der Volksbank Ulm-Biberach (Quereinstieg willkommen). Aufgaben: erste Ansprechperson für Kundenanfragen, aktive Ansprache zu Beratungsthemen und Produkten sowie Erkennen von Kundenbedarfen und Verkaufssignalen, Vermittlung einer erstklassigen Servicequalität, Abwicklung des Bargeldverkehrs und administrative Aufgaben. Profil: kaufmännische Ausbildung, Erfahrung im service- und verkaufsorientierten Kundenkontakt, ausgeprägtes Kommunikationsgeschick.',
  language: 'de',
  locationRaw: 'Warthausen',
  locationNormalized: 'Warthausen',
  countryCode: 'DE',
  remoteType: 'onsite',
  seniority: 'junior',
  techStackTags: ['Kundenservice', 'Kundenberatung', 'Kommunikation', 'Serviceorientierung', 'Bargeldverkehr'],
});

const jobDataAnalystBa: CanonicalJob = buildEvalJob({
  jobId: 'ba_dataanalyst',
  sourceType: 'arbeitsagentur',
  sourceUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12265-511279_JB5189339-S',
  applyUrl: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/12265-511279_JB5189339-S',
  companyNameRaw: 'FERCHAU GmbH',
  companyNameNormalized: 'ferchau gmbh',
  jobTitleRaw: 'Data Analyst (m/w/d)',
  jobTitleNormalized: 'data analyst',
  jobDescriptionText:
    'Data Analyst (m/w/d) bei FERCHAU für einen Kunden im industriell-technischen Umfeld. Aufgaben: Erstellung, Automatisierung und Weiterentwicklung von Reports, Kennzahlen und Management-Dashboards mit Power BI, SQL und Excel; datenbasierte Analysen großer strukturierter und unstrukturierter Datenmengen; enge Zusammenarbeit mit Fertigung, Einkauf und Logistik. Profil: sehr gute Kenntnisse in SQL, Power BI und Excel, Praxiserfahrung mit ERP-Systemen (z. B. SAP), analytische Denkweise.',
  language: 'de',
  locationRaw: 'Kassel',
  locationNormalized: 'Kassel',
  countryCode: 'DE',
  remoteType: 'hybrid',
  seniority: 'mid',
  techStackTags: ['SQL', 'Power BI', 'Excel', 'Dashboards', 'Data Visualization', 'SAP'],
});

const LABELED_BY = 'llm-judge:claude-opus-4-8';

export const BOOTSTRAP_QUERIES: LabeledQuery[] = [
  {
    id: 'backend-engineer-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Backend Engineer',
      skills: ['TypeScript', 'Kotlin', 'Java', 'Node.js', 'PostgreSQL', 'AWS', 'Kubernetes'],
      preferredLanguage: 'en',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobBackendN26,
        relevance: 4,
        rationale:
          'Exact role. The Kotlin/Spring Boot/Postgres/Kubernetes/AWS stack overlaps four of the candidate\'s skills directly, and the day-to-day (owning backend services end to end) is precisely what the candidate wants.',
      },
      {
        job: jobFullstackContentful,
        relevance: 3,
        rationale:
          'Same software-engineering discipline with strong stack overlap (TypeScript, Node.js, Kubernetes, AWS), but fullstack includes frontend (React) rather than the pure backend focus the candidate targets - a strong adjacent fit, not the exact one.',
      },
      {
        job: jobDataAnalystGyg,
        relevance: 2,
        rationale:
          'Adjacent technical field sharing SQL/data tooling, but analytics is a different function from backend engineering - transferable skills, different day-to-day.',
      },
      {
        job: jobPmN26,
        relevance: 1,
        rationale:
          'Same fintech industry and the PM works closely with backend engineers, but it is a product-management role, not an engineering one - only contextual overlap, not the job the candidate is seeking.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Traffic-law litigation practice - a completely different field with no skill or role overlap.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Clinical nursing role - unrelated field, zero overlap.',
      },
      {
        job: jobMarketingBa,
        relevance: 0,
        rationale:
          'E-commerce onsite-marketing role; despite being "data-driven", it is a marketing function with no engineering overlap.',
      },
    ],
  },
  {
    id: 'fullstack-engineer-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Fullstack Engineer',
      skills: ['TypeScript', 'React', 'Node.js'],
      preferredLanguage: 'en',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobFullstackContentful,
        relevance: 4,
        rationale: 'Exact role and an exact skill match on TypeScript, React, and Node.js.',
      },
      {
        job: jobBackendN26,
        relevance: 3,
        rationale:
          'Same software-engineering discipline and a plausible pivot for a fullstack developer, but the stack (Kotlin/JVM) does not overlap the candidate\'s TypeScript/React/Node skills, and it is backend-only - adjacent rather than exact.',
      },
      {
        job: jobDataAnalystGyg,
        relevance: 2,
        rationale: 'Related tech field with some transferable data skills, but a different (analytics) role.',
      },
      {
        job: jobPmN26,
        relevance: 1,
        rationale: 'Same tech industry but a product-management function - only contextual overlap for an engineer.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation role - unrelated field.',
      },
      {
        job: jobFinanceBa,
        relevance: 0,
        rationale: 'Bookkeeping role - unrelated field, no engineering overlap.',
      },
    ],
  },
  {
    id: 'data-analyst-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Data Analyst',
      skills: ['SQL', 'Python', 'Power BI', 'Dashboards', 'Data Visualization'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      // Same-role/different-company-type test: the FERCHAU posting sits at a
      // traditional staffing/manufacturing firm and the GetYourGuide one at a
      // tech company, but both are graded 4 - the candidate's exact toolset and
      // role fit both. FERCHAU is if anything the sharper title/tool match
      // (plain "Data Analyst" + SQL/Power BI/Excel dashboards); GYG leans
      // senior and Python/experimentation-heavy. Grading them equal is the
      // point: relevance follows role and skills, not company prestige.
      {
        job: jobDataAnalystBa,
        relevance: 4,
        rationale:
          'Exact role ("Data Analyst") at a traditional (staffing/manufacturing) employer. Core toolset matches precisely - SQL, Power BI, Excel, dashboards, data visualization. Company type is irrelevant to fit; graded on the role, which is a bullseye.',
      },
      {
        job: jobDataAnalystGyg,
        relevance: 4,
        rationale:
          'Also an exact data-analyst role with strong skill overlap (SQL, Python, dashboards, statistics). Slightly senior and more data-science-leaning than the candidate\'s mid level, but squarely the candidate\'s field - graded equal to the traditional-company analyst on purpose.',
      },
      {
        job: jobBackendN26,
        relevance: 2,
        rationale:
          'Shares the SQL/relational-database world, but this is backend engineering, not analytics - transferable technical adjacency, different role.',
      },
      {
        job: jobPmN26,
        relevance: 2,
        rationale:
          'Data-informed and analytical, and analysts often work alongside PMs, but product management is a different function from data analysis.',
      },
      {
        job: jobFinanceBa,
        relevance: 1,
        rationale:
          'Both are quantitative and Excel-heavy, but bookkeeping/financial reporting is a distinct discipline from data analysis - only glancing overlap.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation role - unrelated field.',
      },
    ],
  },
  {
    id: 'product-manager-fintech-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Senior Product Manager',
      skills: ['Product Strategy', 'Payments', 'Stakeholder Management', 'Fintech'],
      preferredLanguage: 'en',
      seniority: 'senior',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobPmN26,
        relevance: 4,
        rationale:
          'Exact role, seniority, and domain: a senior PM role owning payment-platform products (SEPA/SWIFT) in fintech, matching payments, stakeholder-management, and fintech skills directly.',
      },
      {
        job: jobBackendN26,
        relevance: 2,
        rationale:
          'Same company and payments/banking domain, but an engineering function rather than product - shared domain, different role.',
      },
      {
        job: jobDataAnalystGyg,
        relevance: 2,
        rationale: 'Analytical, data-informed adjacency that PMs collaborate with closely, but a different (analyst) function.',
      },
      {
        job: jobSalesBa,
        relevance: 1,
        rationale:
          'Shares stakeholder-facing and negotiation soft skills, but B2B technical sales is a different function from product management.',
      },
      {
        job: jobMarketingBa,
        relevance: 1,
        rationale: 'Commercial, product-adjacent function (e-commerce), but marketing is not product management.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation role - unrelated field.',
      },
    ],
  },
  {
    id: 'marketing-manager-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Marketing Manager',
      skills: ['Campaign Management', 'Performance Marketing', 'Analytics'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      // Same-role/different-company-type test (tech co. vs. traditional
      // e-commerce co.). Both land at 3, not 4, because neither is a general
      // campaign-management generalist: the N26 role is a strong
      // performance-marketing/analytics fit but is Madrid-based (outside the
      // candidate's DE market) and narrowly influencer/affiliate; the WITT role
      // is in-market and titled exactly "Marketing Manager" but is really an
      // onsite/product-content e-commerce specialization. The role fit is
      // comparable across both company types, which is what this pair tests.
      {
        job: jobMarketingN26,
        relevance: 3,
        rationale:
          'Strong fit on the archetype\'s core (performance marketing + data-driven analytics), but docked one level: the posting is Madrid-based (outside the candidate\'s German target market) and narrowly focused on influencer/affiliate rather than general campaign management.',
      },
      {
        job: jobMarketingBa,
        relevance: 3,
        rationale:
          'In-market ("Marketing Manager" in Germany) with genuine performance-marketing and analytics overlap, but the actual work is onsite/product-content e-commerce merchandising rather than the campaign management the candidate targets - a comparable overall fit to the tech-company role.',
      },
      {
        job: jobSalesBa,
        relevance: 1,
        rationale: 'Commercial/revenue-adjacent function, but sales is distinct from marketing - only glancing overlap.',
      },
      {
        job: jobDataAnalystGyg,
        relevance: 1,
        rationale: 'Shares an analytics/data-driven orientation, but it is an analyst role, not a marketing one.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation role - unrelated field.',
      },
      {
        job: jobFinanceBa,
        relevance: 0,
        rationale: 'Bookkeeping role - unrelated field.',
      },
    ],
  },
  {
    id: 'legal-counsel-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Legal Counsel',
      skills: ['Contract Law', 'Compliance', 'Negotiation'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      // Both are "legal" jobs but graded differently on purpose. The candidate
      // targets in-house counsel work (contract law, compliance, negotiation),
      // which is exactly the GYG role's day-to-day (SaaS/vendor/AI contract
      // review and negotiation, data-protection compliance). The Arbeitsagentur
      // role is a qualified attorney position but in traffic-law litigation -
      // same profession, different specialization, and it does not touch the
      // candidate's contract-law/compliance focus. Hence 4 vs. 2.
      {
        job: jobLegalGyg,
        relevance: 4,
        rationale:
          'Exactly the target: an in-house Legal Counsel role centered on reviewing and negotiating contracts (SaaS/vendor/AI agreements) and owning data-protection compliance - a direct match to contract law, compliance, and negotiation.',
      },
      {
        job: jobLegalBa,
        relevance: 2,
        rationale:
          'Same profession (a qualified Rechtsanwalt role) with real overlap in legal drafting and negotiation, but it is traffic-law litigation - a different specialization that does not cover the candidate\'s contract-law/compliance focus.',
      },
      {
        job: jobPmN26,
        relevance: 1,
        rationale:
          'Works cross-functionally with Compliance in a regulated payments domain, so there is glancing regulatory adjacency, but it is a product-management role, not legal work.',
      },
      {
        job: jobSalesBa,
        relevance: 1,
        rationale: 'Shares negotiation as a soft skill, but sales is not a legal function - only glancing overlap.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering role - unrelated field.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobFinanceBa,
        relevance: 0,
        rationale: 'Bookkeeping role - unrelated field.',
      },
    ],
  },
  {
    id: 'sales-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Vertriebsmitarbeiter',
      skills: ['B2B-Vertrieb', 'Kundenbeziehungen', 'Verhandlung', 'Vertriebsstrategie'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobSalesBa,
        relevance: 4,
        rationale:
          'Exact role: B2B technical sales owning the full sales process, client relationships, negotiation, and sales strategy - a direct skill and role match.',
      },
      {
        job: jobSupportBa,
        relevance: 2,
        rationale:
          'Customer-facing and explicitly sales-tinged (recognizing sales signals, cross-selling), but primarily a service role rather than field sales - a genuine adjacency.',
      },
      {
        job: jobMarketingBa,
        relevance: 1,
        rationale: 'Commercial/revenue-adjacent function, but marketing is distinct from sales - only glancing overlap.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering role - unrelated field.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobFinanceBa,
        relevance: 0,
        rationale: 'Bookkeeping role - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation role - unrelated field.',
      },
    ],
  },
  {
    id: 'hr-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Personalreferent',
      skills: ['Personaladministration', 'Arbeitsrecht', 'Recruiting', 'SAP HCM'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobHrBa,
        relevance: 4,
        rationale:
          'Exact role: operational HR/Personalreferent work with a direct match on personnel administration, labor law, and SAP HCM.',
      },
      {
        job: jobFinanceBa,
        relevance: 1,
        rationale:
          'Shares the kaufmännisch back-office world (both need a commercial apprenticeship, both touch payroll), but accounting is a different function from HR.',
      },
      {
        job: jobSupportBa,
        relevance: 1,
        rationale: 'Service-oriented commercial back-office role, but customer service is not HR - only glancing overlap.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering role - unrelated field.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobSalesBa,
        relevance: 0,
        rationale: 'Field-sales role - unrelated to HR administration.',
      },
      {
        job: jobMarketingBa,
        relevance: 0,
        rationale: 'Marketing role - unrelated field.',
      },
    ],
  },
  {
    id: 'finance-accounting-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Buchhalter',
      skills: ['Buchhaltung', 'Rechnungswesen', 'Bilanzierung', 'Buchhaltungssoftware'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'any',
    }),
    jobs: [
      {
        job: jobFinanceBa,
        relevance: 4,
        rationale:
          'Exact role: bookkeeping, financial statements, and accounting software - a direct match to the candidate\'s accounting skill set.',
      },
      {
        job: jobHrBa,
        relevance: 1,
        rationale:
          'Adjacent kaufmännisch back-office function with a payroll touchpoint, but HR administration is a different discipline from accounting.',
      },
      {
        job: jobDataAnalystBa,
        relevance: 1,
        rationale:
          'Shares a quantitative, Excel-heavy orientation, but BI/reporting analytics is distinct from bookkeeping - only glancing overlap.',
      },
      {
        job: jobSupportBa,
        relevance: 1,
        rationale: 'Bank service role touching financial products, but it is customer service, not accounting.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering role - unrelated field.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field.',
      },
      {
        job: jobSalesBa,
        relevance: 0,
        rationale: 'Field-sales role - unrelated to accounting.',
      },
    ],
  },
  {
    id: 'healthcare-nursing-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Pflegefachkraft',
      skills: ['Patientenbetreuung', 'Pflege', 'Pflegefachkraft'],
      preferredLanguage: 'de',
      seniority: 'mid',
      locationPreference: 'onsite',
    }),
    jobs: [
      // Furthest-field candidate: every non-nursing job should sit at 0. This
      // is the false-positive test - the algorithm must not let any tech/office
      // role sneak above the one genuine match.
      {
        job: jobHealthcareBa,
        relevance: 4,
        rationale: 'Exact role: a Pflegefachkraft position matching the nursing qualification and patient-care focus directly.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering - as far from clinical nursing as the pool gets.',
      },
      {
        job: jobPmN26,
        relevance: 0,
        rationale: 'Product management - unrelated field.',
      },
      {
        job: jobFinanceBa,
        relevance: 0,
        rationale: 'Bookkeeping - unrelated field.',
      },
      {
        job: jobLegalBa,
        relevance: 0,
        rationale: 'Legal litigation - unrelated field.',
      },
      {
        job: jobSalesBa,
        relevance: 0,
        rationale: 'Field sales - unrelated field.',
      },
      {
        job: jobSupportBa,
        relevance: 0,
        rationale: 'Bank customer service - unrelated field despite being people-facing.',
      },
    ],
  },
  {
    id: 'customer-support-real',
    labeledBy: LABELED_BY,
    profile: buildEvalProfile({
      targetRole: 'Kundenservice',
      skills: ['Kundenservice', 'Kundenberatung', 'Kommunikation', 'Serviceorientierung'],
      preferredLanguage: 'de',
      seniority: 'junior',
      locationPreference: 'onsite',
    }),
    jobs: [
      {
        job: jobSupportBa,
        relevance: 4,
        rationale:
          'Exact role: a Kundenservice/Serviceberater position matching customer service, advisory, communication, and service orientation directly.',
      },
      {
        job: jobSalesBa,
        relevance: 2,
        rationale:
          'Customer-facing with relationship-building and communication overlap, but field sales carries a heavier acquisition/quota focus than a service role.',
      },
      {
        job: jobHrBa,
        relevance: 1,
        rationale: 'Service-oriented commercial back-office role, but HR administration is a different function.',
      },
      {
        job: jobFinanceBa,
        relevance: 1,
        rationale: 'Adjacent kaufmännisch role, but bookkeeping is not customer-facing service work.',
      },
      {
        job: jobBackendN26,
        relevance: 0,
        rationale: 'Backend engineering role - unrelated field.',
      },
      {
        job: jobHealthcareBa,
        relevance: 0,
        rationale: 'Nursing role - unrelated field despite being people-facing.',
      },
      {
        job: jobMarketingBa,
        relevance: 0,
        rationale: 'Marketing role - unrelated field.',
      },
    ],
  },
];
