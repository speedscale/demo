// Export all API modules
export { default as apiClient } from './client';
export type { ApiResponse, PaginatedResponse } from './client';

export { AuthAPI } from './auth';
export type { 
  LoginRequest, 
  RegisterRequest, 
  AuthResponse, 
  User as AuthUser 
} from '../types/auth';

export { AccountsAPI } from './accounts';
export type { 
  Account, 
  CreateAccountRequest, 
  UpdateAccountRequest, 
  AccountSummary 
} from './accounts';

export { TransactionsAPI } from './transactions';
export type { 
  Transaction, 
  CreateTransactionRequest, 
  TransactionSummary, 
  TransactionFilters 
} from './transactions';

export { UsersAPI } from './users';
export type { 
  User as UserEntity, 
  UpdateUserRequest, 
  ChangePasswordRequest, 
  UserProfile, 
  UserPreferences 
} from './users';

// Re-export commonly used types
export type { User } from '../types/auth';

// API endpoints configuration
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/users/login',
    REGISTER: '/api/users/register',
    LOGOUT: '/api/users/logout',
    REFRESH: '/api/users/refresh',
    PROFILE: '/api/users/profile',
  },
  ACCOUNTS: {
    BASE: '/api/accounts',
    SUMMARY: '/api/accounts/summary',
    BALANCE: (id: number) => `/api/accounts/${id}/balance`,
    STATUS: (id: number) => `/api/accounts/${id}/status`,
    TRANSACTIONS: (id: number) => `/api/accounts/${id}/transactions`,
    SEARCH: '/api/accounts/search',
  },
  TRANSACTIONS: {
    BASE: '/api/transactions',
    SUMMARY: '/api/transactions/summary',
    RECENT: '/api/transactions/recent',
    SEARCH: '/api/transactions/search',
    CANCEL: (id: number) => `/api/transactions/${id}/cancel`,
    EXPORT: '/api/transactions/export',
    REPORTS: {
      MONTHLY: '/api/transactions/reports/monthly',
    },
  },
  USERS: {
    BASE: '/api/users',
    PROFILE: '/api/users/profile',
    PASSWORD: '/api/users/password',
    PREFERENCES: '/api/users/preferences',
    VERIFY_EMAIL: '/api/users/verify-email',
    VERIFY_PHONE: '/api/users/verify-phone',
    PASSWORD_RESET: '/api/users/password-reset',
    TWO_FACTOR: '/api/users/2fa',
    ACTIVITY: '/api/users/activity',
    SESSIONS: '/api/users/sessions',
    AVATAR: '/api/users/avatar',
    SEARCH: '/api/users/search',
    CHECK_USERNAME: '/api/users/check-username',
    CHECK_EMAIL: '/api/users/check-email',
  },
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Common error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  TIMEOUT_ERROR: 'Request timeout. Please try again.',
  UNAUTHORIZED: 'Unauthorized. Please log in again.',
  FORBIDDEN: 'Forbidden. You do not have permission to perform this action.',
  NOT_FOUND: 'Not found. The requested resource does not exist.',
  VALIDATION_ERROR: 'Validation error. Please check your input.',
  CONFLICT: 'Conflict. The request could not be completed due to a conflict.',
  INTERNAL_ERROR: 'Internal server error. Please try again later.',
  SERVICE_UNAVAILABLE: 'Service unavailable. Please try again later.',
} as const;

// Utility functions for API responses
import type { ApiResponse as ApiResponseType } from './client';

export const ApiUtils = {
  isSuccess: <T>(response: ApiResponseType<T>): response is ApiResponseType<T> & { success: true; data: T } => {
    return response.success;
  },

  isError: <T>(response: ApiResponseType<T>): response is ApiResponseType<T> & { success: false; message: string } => {
    return !response.success;
  },

  getErrorMessage: <T>(response: ApiResponseType<T>): string => {
    if (response.success) return '';
    return response.message || 'An error occurred';
  },

  getErrorMessages: <T>(response: ApiResponseType<T>): string[] => {
    if (response.success) return [];
    return response.errors || [response.message || 'An error occurred'];
  },

  hasData: <T>(response: ApiResponseType<T>): response is ApiResponseType<T> & { data: T } => {
    return response.success && response.data !== undefined;
  },

  getData: <T>(response: ApiResponseType<T>): T | null => {
    return response.success ? response.data || null : null;
  },
};

// Export default API client
export { apiClient as default } from './client';