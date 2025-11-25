const EMAIL_BATCH_REGEX = /\.([0-9]{2})[a-z]/i;
const MAX_YEAR_LEVEL = 6;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

export const YEAR_LEVEL_OPTIONS = [1, 2, 3];
export const INTAKE_YEAR_OPTIONS = [23, 24, 25];

export function extractIntakeCodeFromEmail(email?: string | null): number | null {
  if (!email) return null;
  const match = email.match(EMAIL_BATCH_REGEX);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  if (Number.isNaN(code)) return null;
  return code;
}

export function getIntakeYearFromEmail(email?: string | null): number | null {
  const intakeCode = extractIntakeCodeFromEmail(email);
  if (intakeCode === null) return null;

  const pivot = 50; 
  return (intakeCode < pivot ? 2000 : 1900) + intakeCode;
}

export function getYearLevelFromIntakeYear(intakeYear: number, referenceDate = new Date()): number {
  const diff = referenceDate.getFullYear() - intakeYear;
  return clamp(diff + 1, 1, MAX_YEAR_LEVEL);
}

export function getYearMetadataFromEmail(
  email?: string | null,
  referenceDate = new Date()
): { intakeYear: number; yearLevel: number } | null {
  const intakeYear = getIntakeYearFromEmail(email);
  if (!intakeYear) return null;
  return {
    intakeYear,
    yearLevel: getYearLevelFromIntakeYear(intakeYear, referenceDate),
  };
}


