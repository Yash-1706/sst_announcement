export interface ValidationErrorItem {
  field: string;
  message: string;
}

export class ValidationError extends Error {
  errors: ValidationErrorItem[];

  constructor(errors: ValidationErrorItem[]) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export function validateAnnouncement(data: any): ValidationErrorItem[] {
  const errors: ValidationErrorItem[] = [];

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required and must be a non-empty string' });
  } else if (data.title.length > 200) {
    errors.push({ field: 'title', message: 'Title must be less than 200 characters' });
  }

  if (!data.description || typeof data.description !== 'string' || data.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required and must be a non-empty string' });
  } else if (data.description.length > 5000) {
    errors.push({ field: 'description', message: 'Description must be less than 5000 characters' });
  }

  if (!data.category || typeof data.category !== 'string') {
    errors.push({ field: 'category', message: 'Category is required' });
  }

  const validCategories = [
    'college',
    'tech',
    'tech-events',
    'tech-workshops',
    'academic',
    'sports',
    'cultural',
    'other',
  ];
  if (data.category && !validCategories.includes(data.category.toLowerCase())) {
    errors.push({ field: 'category', message: `Category must be one of: ${validCategories.join(', ')}` });
  }

  if (data.expiry_date && !isValidDate(data.expiry_date)) {
    errors.push({ field: 'expiry_date', message: 'Expiry date must be a valid date' });
  }

  if (data.scheduled_at && !isValidDate(data.scheduled_at)) {
    errors.push({ field: 'scheduled_at', message: 'Scheduled date must be a valid date' });
  }

  if (data.reminder_time && !isValidDate(data.reminder_time)) {
    errors.push({ field: 'reminder_time', message: 'Reminder time must be a valid date' });
  }

  if (data.priority_until && !isValidDate(data.priority_until)) {
    errors.push({ field: 'priority_until', message: 'Priority until must be a valid date' });
  }

  if (data.emergency_expires_at && !isValidDate(data.emergency_expires_at)) {
    errors.push({ field: 'emergency_expires_at', message: 'Emergency expiration time must be a valid date' });
  }

  if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
    errors.push({ field: 'is_active', message: 'is_active must be a boolean' });
  }

  if (data.status && typeof data.status !== 'string') {
    errors.push({ field: 'status', message: 'Status must be a string' });
  }

  const validStatuses = ['active', 'scheduled', 'urgent', 'expired'];
  if (data.status && !validStatuses.includes(data.status.toLowerCase())) {
    errors.push({ field: 'status', message: `Status must be one of: ${validStatuses.join(', ')}` });
  }

  if (data.target_years !== undefined && data.target_years !== null) {
    if (!Array.isArray(data.target_years)) {
      errors.push({ field: 'target_years', message: 'target_years must be an array of intake year codes' });
    } else {
      const hasInvalid = data.target_years.some(
        (year: unknown) =>
          typeof year !== 'number' ||
          !Number.isInteger(year) ||
          year < 1 ||
          year > 99
      );
      if (hasInvalid) {
        errors.push({ field: 'target_years', message: 'Intake year codes must be integers between 20 and 99' });
      }
    }
  }

  return errors;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

export function validateUserId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}
