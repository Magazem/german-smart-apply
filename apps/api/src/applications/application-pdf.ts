import PDFDocument from 'pdfkit';

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
  createdAt: Date;
}

export interface ApplicationPdfCandidate {
  fullName: string | null;
  email: string;
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

/** Renders a candidate's tailored CV + cover letter for one job into a downloadable PDF. */
export function buildApplicationPdf(
  candidate: ApplicationPdfCandidate,
  job: ApplicationPdfJob,
  draft: ApplicationPdfDraft,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text(candidate.fullName ?? candidate.email);
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(candidate.email);
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
    addSection(doc, `Tailored CV (${draft.variantLabel})`, draft.cvVariantText);

    doc.moveDown(1.5);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#888888')
      .text(`Generated ${draft.createdAt.toISOString().slice(0, 10)} · German Smart Apply`);

    doc.end();
  });
}
