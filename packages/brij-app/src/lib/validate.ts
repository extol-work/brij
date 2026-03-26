/** Input validation helpers for API routes */

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 2000;
const MAX_NAME = 100;
const MAX_JOURNAL = 5000;
const MAX_EXPENSE_DESC = 500;

export function validateText(value: unknown, field: string, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return `${field} must be ${maxLength} characters or less`;
  return null;
}

export function truncate(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function validateExpenseAmount(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return "Amount must be a valid number (up to 2 decimal places)";
  const num = parseFloat(str);
  if (num <= 0) return "Amount must be positive";
  if (num > 999999999.99) return "Amount too large";
  return null;
}

export const limits = { MAX_TITLE, MAX_DESCRIPTION, MAX_NAME, MAX_JOURNAL, MAX_EXPENSE_DESC };
