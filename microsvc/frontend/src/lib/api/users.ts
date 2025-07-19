import { apiClient, ApiResponse, PaginatedResponse } from './client';

export interface User {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  roles: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  roles: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  preferences?: {
    theme: 'light' | 'dark';
    language: string;
    currency: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
    };
  };
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  currency: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
}

export class UsersAPI {
  // Get current user profile
  static async getProfile(): Promise<ApiResponse<UserProfile>> {
    return await apiClient.get<UserProfile>('/api/user-service/profile');
  }

  // Update user profile
  static async updateProfile(userData: UpdateUserRequest): Promise<ApiResponse<User>> {
    return await apiClient.put<User>('/api/user-service/profile', userData);
  }

  // Change password
  static async changePassword(passwordData: ChangePasswordRequest): Promise<ApiResponse<void>> {
    return await apiClient.put<void>('/api/user-service/password', passwordData);
  }

  // Get user by ID (admin only)
  static async getUser(userId: number): Promise<ApiResponse<User>> {
    return await apiClient.get<User>(`/api/user-service/${userId}`);
  }

  // Get all users (admin only)
  static async getUsers(
    page: number = 0,
    size: number = 10,
    sort: string = 'createdAt,desc'
  ): Promise<ApiResponse<PaginatedResponse<User>>> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      sort,
    });

    return await apiClient.get<PaginatedResponse<User>>(`/api/user-service?${params}`);
  }

  // Update user status (admin only)
  static async updateUserStatus(
    userId: number,
    status: User['status']
  ): Promise<ApiResponse<User>> {
    return await apiClient.patch<User>(`/api/user-service/${userId}/status`, { status });
  }

  // Delete user (admin only)
  static async deleteUser(userId: number): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>(`/api/user-service/${userId}`);
  }

  // Search users (admin only)
  static async searchUsers(
    query: string,
    page: number = 0,
    size: number = 10
  ): Promise<ApiResponse<PaginatedResponse<User>>> {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      size: size.toString(),
    });

    return await apiClient.get<PaginatedResponse<User>>(`/api/user-service/search?${params}`);
  }

  // Check username availability
  static async checkUsernameAvailability(username: string): Promise<ApiResponse<{ available: boolean }>> {
    return await apiClient.get<{ available: boolean }>(`/api/user-service/check-username?username=${username}`);
  }

  // Check email availability
  static async checkEmailAvailability(email: string): Promise<ApiResponse<{ available: boolean }>> {
    return await apiClient.get<{ available: boolean }>(`/api/user-service/check-email?email=${email}`);
  }

  // Get user preferences
  static async getUserPreferences(): Promise<ApiResponse<UserPreferences>> {
    return await apiClient.get<UserPreferences>('/api/user-service/preferences');
  }

  // Update user preferences
  static async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<ApiResponse<UserPreferences>> {
    return await apiClient.put<UserPreferences>('/api/user-service/preferences', preferences);
  }

  // Send email verification
  static async sendEmailVerification(): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/verify-email');
  }

  // Verify email with token
  static async verifyEmail(token: string): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/verify-email/confirm', { token });
  }

  // Send phone verification
  static async sendPhoneVerification(): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/verify-phone');
  }

  // Verify phone with code
  static async verifyPhone(code: string): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/verify-phone/confirm', { code });
  }

  // Request password reset
  static async requestPasswordReset(email: string): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/password-reset', { email });
  }

  // Reset password with token
  static async resetPassword(
    token: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/password-reset/confirm', {
      token,
      newPassword,
      confirmPassword,
    });
  }

  // Enable two-factor authentication
  static async enableTwoFactor(): Promise<ApiResponse<{ qrCode: string; secret: string }>> {
    return await apiClient.post<{ qrCode: string; secret: string }>('/api/user-service/2fa/enable');
  }

  // Confirm two-factor authentication setup
  static async confirmTwoFactor(code: string): Promise<ApiResponse<{ backupCodes: string[] }>> {
    return await apiClient.post<{ backupCodes: string[] }>('/api/user-service/2fa/confirm', { code });
  }

  // Disable two-factor authentication
  static async disableTwoFactor(password: string): Promise<ApiResponse<void>> {
    return await apiClient.post<void>('/api/user-service/2fa/disable', { password });
  }

  // Get user activity log
  static async getUserActivityLog(
    page: number = 0,
    size: number = 10
  ): Promise<ApiResponse<PaginatedResponse<{
    id: number;
    action: string;
    description: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
  }>>> {
    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
    });

    return await apiClient.get<PaginatedResponse<{
      id: number;
      action: string;
      description: string;
      ipAddress: string;
      userAgent: string;
      createdAt: string;
    }>>(`/api/user-service/activity?${params}`);
  }

  // Get user sessions
  static async getUserSessions(): Promise<ApiResponse<{
    id: string;
    device: string;
    browser: string;
    location: string;
    ipAddress: string;
    current: boolean;
    lastActivity: string;
    createdAt: string;
  }[]>> {
    return await apiClient.get<{
      id: string;
      device: string;
      browser: string;
      location: string;
      ipAddress: string;
      current: boolean;
      lastActivity: string;
      createdAt: string;
    }[]>('/api/user-service/sessions');
  }

  // Revoke user session
  static async revokeSession(sessionId: string): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>(`/api/user-service/sessions/${sessionId}`);
  }

  // Revoke all other sessions
  static async revokeAllOtherSessions(): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>('/api/user-service/sessions/others');
  }

  // Update user avatar
  static async updateAvatar(file: File): Promise<ApiResponse<{ avatarUrl: string }>> {
    const formData = new FormData();
    formData.append('avatar', file);

    return await apiClient.post<{ avatarUrl: string }>('/api/user-service/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  // Delete user avatar
  static async deleteAvatar(): Promise<ApiResponse<void>> {
    return await apiClient.delete<void>('/api/user-service/avatar');
  }
}

