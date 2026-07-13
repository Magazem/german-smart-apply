import PDFDocument from 'pdfkit';
import { buffer as consumePdfBuffer } from 'node:stream/consumers';

export interface ApplicationPdfJob {
  jobTitle: string;
  companyName: string;
  locationNormalized: string;
  remoteType: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  applyUrl: string;
}

export interface ApplicationPdfDraft {
  cvVariantText: string;
  coverLetterText: string;
  variantLabel: string;
}

export interface ApplicationPdfCandidate {
  fullName: string | null;
  email: string;
  phone: string | null;
}

function formatSalary(job: ApplicationPdfJob): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.salaryCurrency ?? '';
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${job.salaryMin.toLocaleString('en-US')}–${job.salaryMax.toLocaleString('en-US')} ${currency}`.trim();
  }
  const single = job.salaryMin ?? job.salaryMax;
  return `${single!.toLocaleString('en-US')} ${currency}`.trim();
}

function addSection(doc: PDFKit.PDFDocument, title: string, body: string): void {
  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(13).text(title);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10.5).text(body, { lineGap: 3 });
}

/**
 * Renders a candidate's tailored CV + cover letter for one job into a downloadable PDF.
 *
 * Uses `stream/consumers`' `buffer()` rather than the commonly-shown `on('data')`/`on('end')`
 * pattern: under load, pdfkit@0.19.x's automatic page-overflow handling (triggered whenever a
 * single `.text()` call's content doesn't fit on one page - i.e. almost any real cover letter
 * or CV) has an upstream reentrancy bug that can emit a truncated/invalid PDF (a corrupt xref
 * table) with the naive event-listener pattern. `stream/consumers`' pull-based consumption
 * measurably reduces (though does not eliminate) how often this is hit. If this keeps surfacing
 * in practice, the real fix is moving off pdfkit's programmatic drawing entirely (e.g. to an
 * HTML/CSS-templated renderer), not further stream-consumption workarounds.
 */
export async function buildApplicationPdf(
  candidate: ApplicationPdfCandidate,
  job: ApplicationPdfJob,
  draft: ApplicationPdfDraft,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56 });

  doc.font('Helvetica-Bold').fontSize(18).text(candidate.fullName ?? candidate.email);
  doc.font('Helvetica').fontSize(10).fillColor('#555555').text(
    [candidate.email, candidate.phone].filter(Boolean).join(' · '),
  );
  doc.fillColor('#000000');

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(15).text(job.jobTitle);
  doc.font('Helvetica').fontSize(11).text(`${job.companyName} – ${job.locationNormalized}`);

  const salary = formatSalary(job);
  const detailParts = [job.employmentType, job.remoteType, salary].filter(
    (part): part is string => Boolean(part),
  );
  if (detailParts.length > 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(detailParts.join(' · '));
    doc.fillColor('#000000');
  }
  doc.font('Helvetica').fontSize(9).fillColor('#3366cc').text(job.applyUrl, { link: job.applyUrl });
  doc.fillColor('#000000');

  addSection(doc, 'Cover Letter', draft.coverLetterText);
  doc.addPage();
  addSection(doc, `Tailored CV (${draft.variantLabel})`, draft.cvVariantText);

  doc.end();
  return Buffer.from(await consumePdfBuffer(doc));
}
