export type UserRole = 'student' | 'student_admin' | 'admin' | 'super_admin';

export interface AuthenticatedUser {
  id: number;
  email: string;
  role: UserRole;
  google_id?: string;
  username?: string | null;
  created_at?: Date | string | null;
  last_login?: Date | string | null;
  is_admin?: boolean;
  intake_year?: number | null;
  year_level?: number | null;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
  code?: string;
  details?: unknown;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResult<T> {
  data: T[];
  total: number;
}
