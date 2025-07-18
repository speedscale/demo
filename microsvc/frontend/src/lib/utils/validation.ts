import { z } from 'zod';

// Login form validation schema
export const loginSchema = z.object({
  usernameOrEmail: z
    .string()
    .min(1, 'Username or email is required')
    .max(255, 'Username or email is too long'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

// Register form validation schema
export const registerSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username is too long')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address')
    .max(255, 'Email is too long'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters')
    .max(128, 'Password is too long'),
  confirmPassword: z
    .string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Account creation form validation schema
export const createAccountSchema = z.object({
  accountType: z.enum(['CHECKING', 'SAVINGS', 'CREDIT', 'INVESTMENT'], {
    message: 'Account type is required',
  }),
  initialBalance: z
    .number()
    .min(0, 'Initial balance cannot be negative')
    .max(1000000, 'Initial balance cannot exceed $1,000,000')
    .optional(),
  currency: z
    .string()
    .min(3, 'Currency code must be 3 characters')
    .max(3, 'Currency code must be 3 characters')
    .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters')
    .optional()
    .default('USD'),
});

// Transaction creation form validation schema
export const createTransactionSchema = z.object({
  accountId: z.number().min(1, 'Account is required'),
  toAccountId: z.number().optional(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER'], {
    message: 'Transaction type is required',
  }),
  amount: z
    .number()
    .min(0.01, 'Amount must be greater than 0')
    .max(100000, 'Amount cannot exceed $100,000'),
  currency: z
    .string()
    .min(3, 'Currency code must be 3 characters')
    .max(3, 'Currency code must be 3 characters')
    .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters')
    .optional()
    .default('USD'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(255, 'Description is too long'),
}).refine((data) => {
  if (data.type === 'TRANSFER' && !data.toAccountId) {
    return false;
  }
  return true;
}, {
  message: 'Destination account is required for transfers',
  path: ['toAccountId'],
});

// User profile update form validation schema
export const updateProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
    .optional(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name is too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
    .optional(),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number')
    .optional(),
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(255, 'Email is too long')
    .optional(),
});

// Change password form validation schema
export const changePasswordSchema = z.object({
  currentPassword: z
    .string()
    .min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(6, 'New password must be at least 6 characters')
    .max(128, 'New password is too long'),
  confirmPassword: z
    .string()
    .min(1, 'Password confirmation is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Search form validation schema
export const searchSchema = z.object({
  query: z
    .string()
    .min(1, 'Search query is required')
    .max(255, 'Search query is too long'),
  filters: z.object({
    type: z.enum(['ACCOUNT', 'TRANSACTION', 'USER']).optional(),
    dateRange: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional(),
    amount: z.object({
      min: z.number().min(0).optional(),
      max: z.number().min(0).optional(),
    }).optional(),
  }).optional(),
});

// Contact form validation schema
export const contactSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name is too long'),
  email: z
    .string()
    .email('Please enter a valid email address')
    .max(255, 'Email is too long'),
  subject: z
    .string()
    .min(1, 'Subject is required')
    .max(200, 'Subject is too long'),
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(1000, 'Message is too long'),
});

// Preferences form validation schema
export const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  language: z
    .string()
    .min(2, 'Language code must be at least 2 characters')
    .max(5, 'Language code is too long')
    .optional(),
  currency: z
    .string()
    .min(3, 'Currency code must be 3 characters')
    .max(3, 'Currency code must be 3 characters')
    .regex(/^[A-Z]{3}$/, 'Currency code must be uppercase letters')
    .optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    push: z.boolean().optional(),
  }).optional(),
});

// Common validation utilities
export const validationUtils = {
  // Email validation
  isValidEmail: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Phone number validation
  isValidPhone: (phone: string): boolean => {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone);
  },

  // Password strength validation
  getPasswordStrength: (password: string): {
    score: number;
    feedback: string[];
  } => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push('Password should be at least 8 characters long');
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain uppercase letters');
    }

    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain numbers');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain special characters');
    }

    return { score, feedback };
  },

  // Amount validation
  isValidAmount: (amount: number, min: number = 0.01, max: number = 1000000): boolean => {
    return amount >= min && amount <= max;
  },

  // Account number validation
  isValidAccountNumber: (accountNumber: string): boolean => {
    const accountRegex = /^\d{10,20}$/;
    return accountRegex.test(accountNumber);
  },

  // Currency code validation
  isValidCurrencyCode: (code: string): boolean => {
    const currencyRegex = /^[A-Z]{3}$/;
    return currencyRegex.test(code);
  },

  // Date validation
  isValidDate: (date: string): boolean => {
    const dateObject = new Date(date);
    return !isNaN(dateObject.getTime());
  },

  // Date range validation
  isValidDateRange: (from: string, to: string): boolean => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return fromDate <= toDate;
  },
};

// TypeScript types for form data
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type CreateAccountFormData = z.infer<typeof createAccountSchema>;
export type CreateTransactionFormData = z.infer<typeof createTransactionSchema>;
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type SearchFormData = z.infer<typeof searchSchema>;
export type ContactFormData = z.infer<typeof contactSchema>;
export type PreferencesFormData = z.infer<typeof preferencesSchema>;