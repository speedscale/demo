'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthContextType, AuthProviderProps, User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';
import { TokenManager } from './token';
import { AuthAPI } from '../api/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load user from token on mount
  useEffect(() => {
    const initializeAuth = async () => {
      const token = TokenManager.getToken();
      
      if (token && !TokenManager.isTokenExpired(token)) {
        try {
          // Try to get user profile from API
          const profileResponse = await AuthAPI.getProfile();
          
          if (profileResponse.success && profileResponse.data) {
            setUser(profileResponse.data);
            setIsAuthenticated(true);
          } else {
            // If API call fails, fall back to token data
            const userFromToken = TokenManager.getUserFromToken(token);
            if (userFromToken) {
              setUser({
                id: userFromToken.id,
                username: userFromToken.username,
                email: '', // Will be populated when profile is fetched
                roles: userFromToken.roles,
                createdAt: '',
                updatedAt: '',
              });
              setIsAuthenticated(true);
            } else {
              TokenManager.removeToken();
              setIsAuthenticated(false);
            }
          }
        } catch {
          TokenManager.removeToken();
          setIsAuthenticated(false);
        }
      } else {
        TokenManager.removeToken();
        setIsAuthenticated(false);
      }
      
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = useCallback(async (credentials: LoginRequest): Promise<AuthResponse> => {
    setIsLoading(true);
    
    try {
      const response = await AuthAPI.login(credentials);
      
      if (response.success && response.data) {
        const { token, id, username, email, roles } = response.data;
        
        // Store token
        TokenManager.setToken(token);
        
        // Set user state
        const userData: User = {
          id,
          username,
          email,
          roles,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        setUser(userData);
        setIsAuthenticated(true);
      }
      
      return response;
    } catch {
      return {
        success: false,
        message: 'Login failed',
        errors: ['An unexpected error occurred'],
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (userData: RegisterRequest): Promise<AuthResponse> => {
    setIsLoading(true);
    
    try {
      const response = await AuthAPI.register(userData);
      
      if (response.success) {
        // After successful registration, user needs to login
        // We don't auto-login after registration for security
      }
      
      return response;
    } catch {
      return {
        success: false,
        message: 'Registration failed',
        errors: ['An unexpected error occurred'],
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    TokenManager.removeToken();
    setUser(null);
    setIsAuthenticated(false);
    
    // Redirect to login page
    window.location.href = '/login';
  }, []);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const token = TokenManager.getToken();
    
    if (!token || TokenManager.isTokenExpired(token)) {
      logout();
      return false;
    }
    
    try {
      // Try to get fresh user profile to validate token
      const profileResponse = await AuthAPI.getProfile();
      
      if (profileResponse.success && profileResponse.data) {
        setUser(profileResponse.data);
        setIsAuthenticated(true);
        return true;
      } else {
        logout();
        return false;
      }
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  // Auto-refresh token every 5 minutes
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        refreshToken();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [isAuthenticated, refreshToken]);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};