import axios from 'axios';
import { LoginRequest, RegisterRequest, AuthResponse, User } from '../types/auth';
import { TokenManager } from '../auth/token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
const API_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000');

// Create axios instance for auth API
const authAPI = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
authAPI.interceptors.request.use(
  (config) => {
    const token = TokenManager.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor to handle token expiration
authAPI.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If token is expired, remove it and redirect to login
    if (error.response?.status === 401 && !originalRequest._retry) {
      TokenManager.removeToken();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

export class AuthAPI {
  // User registration
  static async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await authAPI.post('/api/user-service/register', userData);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string; errors?: string[] } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Registration failed',
        errors: axiosError.response?.data?.errors || ['Registration failed'],
      };
    }
  }

  // User login
  static async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await authAPI.post('/api/user-service/login', credentials);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string; errors?: string[] } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Login failed',
        errors: axiosError.response?.data?.errors || ['Login failed'],
      };
    }
  }

  // Get user profile
  static async getProfile(): Promise<{ success: boolean; data?: User; message?: string }> {
    try {
      const response = await authAPI.get('/api/user-service/profile');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      return {
        success: false,
        message: axiosError.response?.data?.message || 'Failed to fetch profile',
      };
    }
  }

  // Check username availability
  static async checkUsername(username: string): Promise<{ available: boolean }> {
    try {
      const response = await authAPI.get(`/api/user-service/check-username?username=${username}`);
      return response.data;
    } catch {
      return { available: false };
    }
  }

  // Check email availability
  static async checkEmail(email: string): Promise<{ available: boolean }> {
    try {
      const response = await authAPI.get(`/api/user-service/check-email?email=${email}`);
      return response.data;
    } catch {
      return { available: false };
    }
  }
}