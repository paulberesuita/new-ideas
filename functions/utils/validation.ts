// Input validation helpers

/**
 * Validate date string format (YYYY-MM-DD)
 */
export function isValidDateString(date: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    return false;
  }
  
  const dateObj = new Date(date + 'T00:00:00');
  return dateObj instanceof Date && !isNaN(dateObj.getTime());
}

/**
 * Validate and parse integer from string
 */
export function parseIntSafe(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate idea ID (must be positive integer)
 */
export function isValidIdeaId(id: string | null): boolean {
  if (!id) return false;
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get date string for N days ago
 */
export function getDateStringDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

