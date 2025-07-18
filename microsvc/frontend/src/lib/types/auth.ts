// Authentication types
export interface User {
  id: number;
  username: string;
  email: string;
  roles: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  usernameOrEmail: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data?: {
    token: string;
    type: string;
    id: number;
    username: string;
    email: string;
    roles: string;
  };
  errors?: string[];
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<AuthResponse>;
  register: (userData: RegisterRequest) => Promise<AuthResponse>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
}

export interface AuthProviderProps {
  children: React.ReactNode;
}