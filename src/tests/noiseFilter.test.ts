import test from 'node:test';
import assert from 'node:assert/strict';
import { isSectionPageStamp, stripHeadersAndFooters } from '../utils/noiseFilter';
import { DEFAULT_NOISE_CONFIG } from '../types/spec';

test('titleThenCsiPage matches Title Case and mixed-case footers case-insensitively while preserving prose', () => {
  assert.equal(isSectionPageStamp('Cast-in-Place Concrete 033000 - 5'), true);
  assert.equal(isSectionPageStamp('Cast-In-Place Concrete 03 30 00 - 5'), true);
  assert.equal(isSectionPageStamp('Cast-in-Place Concrete 03 30 00 - Page 5 of 12'), true);
  assert.equal(isSectionPageStamp('Cast-in-Place Concrete 033000 - 5 Page 12 of 303'), true);
  assert.equal(
    isSectionPageStamp('Testing, Adjusting, and Balancing for HVAC 230593 - 100 Page 100 of 303'),
    true
  );

  // Prose lines referencing a CSI code & page number must never be matched as stamps
  assert.equal(isSectionPageStamp('Refer to Section 03 30 00 Page 5'), false);
  assert.equal(isSectionPageStamp('Warranty period shall be 5 years. See page 12.'), false);
  assert.equal(isSectionPageStamp('Submit samples per 03 30 00 - 5'), false);

  const lines = [
    { page: 1, yPct: 0.2, text: 'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE' },
    { page: 1, yPct: 0.94, text: 'Cast-in-Place Concrete 033000 - 5' },
    { page: 2, yPct: 0.91, text: 'Submit samples per 03 30 00 - 5' },
    { page: 2, yPct: 0.93, text: 'Refer to Section 03 30 00 Page 5' },
    { page: 2, yPct: 0.96, text: 'Cast-In-Place Concrete 03 30 00 - Page 5 of 12' },
  ];

  const { cleanLines, strippedLineCount } = stripHeadersAndFooters(
    lines,
    2,
    DEFAULT_NOISE_CONFIG
  );

  assert.equal(strippedLineCount, 2);
  assert.deepEqual(
    cleanLines.map((l) => l.text),
    [
      'SECTION 03 30 00 - CAST-IN-PLACE CONCRETE',
      'Submit samples per 03 30 00 - 5',
      'Refer to Section 03 30 00 Page 5',
    ]
  );
});
