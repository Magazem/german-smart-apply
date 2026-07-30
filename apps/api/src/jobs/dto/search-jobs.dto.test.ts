import { REMOTE_TYPES, SENIORITIES, SOURCE_TYPES } from '@german-smart-apply/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SearchJobsDto } from './search-jobs.dto.js';

/** Mirrors what the global ValidationPipe does to a query string. */
function validateQuery(query: Record<string, unknown>) {
  const dto = plainToInstance(SearchJobsDto, query, { enableImplicitConversion: false });
  return { dto, errors: validateSync(dto as object, { whitelist: true }) };
}

describe('SearchJobsDto', () => {
  // The regression: this DTO hand-copied the allowed source types, and the copy
  // fell behind shared's SourceType - it was missing 'personio' and
  // 'smartrecruiters' long after both adapters shipped and were crawling real
  // jobs. Filtering by either 400'd with a message naming them as invalid. The
  // enums are now derived from one runtime array in @german-smart-apply/shared,
  // and these tests assert the two can't drift apart again.
  it.each(SOURCE_TYPES)('accepts sourceType=%s, every source type shared declares', (sourceType) => {
    const { errors } = validateQuery({ sourceType });
    expect(errors).toHaveLength(0);
  });

  it.each(SENIORITIES)('accepts seniority=%s', (seniority) => {
    const { errors } = validateQuery({ seniority });
    expect(errors).toHaveLength(0);
  });

  it.each(REMOTE_TYPES)('accepts remoteType=%s', (remoteType) => {
    const { errors } = validateQuery({ remoteType });
    expect(errors).toHaveLength(0);
  });

  it('still rejects a source type that does not exist', () => {
    const { errors } = validateQuery({ sourceType: 'monster' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('splits a comma-separated list into an array, the shape RealApiClient sends', () => {
    const { dto, errors } = validateQuery({ sourceType: 'personio,smartrecruiters' });
    expect(errors).toHaveLength(0);
    expect(dto.sourceType).toEqual(['personio', 'smartrecruiters']);
  });

  it('rejects a non-integer salaryMin, which is why the jobs page must round it', () => {
    // The web filter panel is an <input type="number">; typing "1000.5" produced
    // a 400 here, and the jobs page had no error handling to surface it - it just
    // showed loading skeletons forever. toApiFilters now rounds.
    const { errors } = validateQuery({ salaryMin: '1000.5' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts an integer salaryMin', () => {
    const { dto, errors } = validateQuery({ salaryMin: '1000' });
    expect(errors).toHaveLength(0);
    expect(dto.salaryMin).toBe(1000);
  });
});
