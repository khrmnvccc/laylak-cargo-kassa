// When the evening report goes out (Tashkent time). The cron runs once in each hour from 12 to 23
// (vercel.json), so a time up to 23:00 is always caught the same evening.
export const DEFAULT_REPORT_TIME = '19:00';
export const REPORT_TIME_MIN = '12:00';
export const REPORT_TIME_MAX = '23:00';
export const REPORT_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
