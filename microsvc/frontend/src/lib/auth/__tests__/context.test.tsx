import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from '../context'
import { TokenManager } from '../token'
import { AuthAPI } from '../../api/auth'

// Mock the dependencies
jest.mock('../token', () => ({
  TokenManager: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    removeToken: jest.fn(),
    isTokenExpired: jest.fn(),
    getUserFromToken: jest.fn(),
  },
}))

jest.mock('../../api/auth', () => ({
  AuthAPI: {
    login: jest.fn(),
    register: jest.fn(),
    getProfile: jest.fn(),
  },
}))

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    assign: jest.fn(),
  },
  writable: true,
})

const mockTokenManager = TokenManager as jest.Mocked<typeof TokenManager>
const mockAuthAPI = AuthAPI as jest.Mocked<typeof AuthAPI>

// Test component that uses the auth context
const TestComponent: React.FC = () => {
  const { user, isLoading, isAuthenticated, login, register, logout, refreshToken } = useAuth()

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'Loading' : 'Not Loading'}</div>
      <div data-testid="authenticated">{isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>
      <div data-testid="user">{user ? user.username : 'No User'}</div>
      <button onClick={() => login({ usernameOrEmail: 'test', password: 'password' })}>
        Login
      </button>
      <button onClick={() => register({ username: 'test', email: 'test@example.com', password: 'password', confirmPassword: 'password' })}>
        Register
      </button>
      <button onClick={logout}>Logout</button>
      <button onClick={refreshToken}>Refresh Token</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTokenManager.getToken.mockReturnValue(null)
    mockTokenManager.isTokenExpired.mockReturnValue(false)
    mockTokenManager.getUserFromToken.mockReturnValue(null)
  })

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    
    expect(() => {
      render(<TestComponent />)
    }).toThrow('useAuth must be used within an AuthProvider')
    
    consoleSpy.mockRestore()
  })

  it('should provide initial state when no token exists', async () => {
    mockTokenManager.getToken.mockReturnValue(null)
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
  })

  it('should initialize with valid token and user profile', async () => {
    const mockToken = 'valid-token'
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      roles: 'USER',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    }
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(false)
    mockAuthAPI.getProfile.mockResolvedValue({
      success: true,
      data: mockUser,
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('testuser')
  })

  it('should handle expired token during initialization', async () => {
    const mockToken = 'expired-token'
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(true)
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
    expect(mockTokenManager.removeToken).toHaveBeenCalled()
  })

  it('should handle profile fetch failure during initialization', async () => {
    const mockToken = 'valid-token'
    const mockUserFromToken = {
      id: 1,
      username: 'testuser',
      roles: 'USER',
    }
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(false)
    mockTokenManager.getUserFromToken.mockReturnValue(mockUserFromToken)
    mockAuthAPI.getProfile.mockResolvedValue({
      success: false,
      message: 'Profile fetch failed',
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('testuser')
  })

  it('should handle successful login', async () => {
    mockTokenManager.getToken.mockReturnValue(null)
    mockAuthAPI.login.mockResolvedValue({
      success: true,
      data: {
        token: 'new-token',
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        roles: 'USER',
      },
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    })
    
    expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    expect(mockTokenManager.setToken).toHaveBeenCalledWith('new-token')
  })

  it('should handle failed login', async () => {
    mockTokenManager.getToken.mockReturnValue(null)
    mockAuthAPI.login.mockResolvedValue({
      success: false,
      message: 'Invalid credentials',
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
  })

  it('should handle successful registration', async () => {
    mockTokenManager.getToken.mockReturnValue(null)
    mockAuthAPI.register.mockResolvedValue({
      success: true,
      message: 'Registration successful',
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Register' }).click()
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    // Registration doesn't auto-login
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
  })

  it('should handle logout', async () => {
    const mockToken = 'valid-token'
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      roles: 'USER',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    }
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(false)
    mockAuthAPI.getProfile.mockResolvedValue({
      success: true,
      data: mockUser,
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click()
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
    expect(mockTokenManager.removeToken).toHaveBeenCalled()
    expect(window.location.href).toBe('/login')
  })

  it('should handle successful token refresh', async () => {
    const mockToken = 'valid-token'
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      roles: 'USER',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    }
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(false)
    mockAuthAPI.getProfile.mockResolvedValue({
      success: true,
      data: mockUser,
    })
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh Token' }).click()
    })
    
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('Authenticated')
    })
    
    expect(screen.getByTestId('user')).toHaveTextContent('testuser')
  })

  it('should handle failed token refresh', async () => {
    const mockToken = 'expired-token'
    
    mockTokenManager.getToken.mockReturnValue(mockToken)
    mockTokenManager.isTokenExpired.mockReturnValue(true)
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('Not Loading')
    })
    
    await act(async () => {
      screen.getByRole('button', { name: 'Refresh Token' }).click()
    })
    
    expect(screen.getByTestId('authenticated')).toHaveTextContent('Not Authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent('No User')
    expect(mockTokenManager.removeToken).toHaveBeenCalled()
    expect(window.location.href).toBe('/login')
  })
})