import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should complete full registration to login flow', async ({ page }) => {
    // Step 1: Navigate to registration page
    await page.goto('/register');
    
    // Step 2: Fill registration form
    await page.getByPlaceholder('Enter your username').fill('newtestuser');
    await page.getByPlaceholder('Enter your email').fill('newtest@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');
    
    // Mock successful registration
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Registration successful. Please check your email to verify your account.',
        }),
      });
    });
    
    // Step 3: Submit registration
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Registration successful. Please check your email to verify your account.')).toBeVisible();
    
    // Step 4: Navigate to login page
    await page.getByRole('link', { name: 'sign in to your account' }).click();
    await expect(page).toHaveURL('/login');
    
    // Step 5: Login with the same credentials
    await page.getByPlaceholder('Enter your username or email').fill('newtestuser');
    await page.getByPlaceholder('Enter your password').fill('password123');
    
    // Mock successful login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            token: 'fake-jwt-token',
            id: 1,
            username: 'newtestuser',
            email: 'newtest@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Mock profile endpoint
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'newtestuser',
            email: 'newtest@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Step 6: Submit login
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL('/dashboard');
    
    // Step 7: Verify user is logged in
    await expect(page.getByText('Welcome back, newtestuser!')).toBeVisible();
  });

  test('should protect routes when not authenticated', async ({ page }) => {
    // Try to access protected route without authentication
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should redirect authenticated users away from login/register', async ({ page }) => {
    // Mock authentication
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Set up authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'fake-jwt-token');
    });
    
    // Try to access login page when authenticated
    await page.goto('/login');
    await expect(page).toHaveURL('/dashboard');
    
    // Try to access register page when authenticated
    await page.goto('/register');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should handle logout flow', async ({ page }) => {
    // Mock authentication
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Mock accounts data
    await page.route('**/api/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });
    
    // Mock transactions data
    await page.route('**/api/transactions/recent*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });
    
    // Set up authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'fake-jwt-token');
    });
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back, testuser!')).toBeVisible();
    
    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
    
    // Should not be able to access protected routes after logout
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should handle token expiration', async ({ page }) => {
    // Mock authentication with expired token
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Token expired',
        }),
      });
    });
    
    // Set up authentication state with expired token
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'expired-jwt-token');
    });
    
    // Try to access protected route
    await page.goto('/dashboard');
    
    // Should redirect to login due to token expiration
    await expect(page).toHaveURL('/login');
  });

  test('should handle invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Mock failed login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid username or password',
        }),
      });
    });
    
    // Fill login form with invalid credentials
    await page.getByPlaceholder('Enter your username or email').fill('wronguser');
    await page.getByPlaceholder('Enter your password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    // Should display error message
    await expect(page.getByText('Invalid username or password')).toBeVisible();
    
    // Should remain on login page
    await expect(page).toHaveURL('/login');
  });

  test('should handle registration with existing username', async ({ page }) => {
    await page.goto('/register');
    
    // Mock registration failure
    await page.route('**/api/auth/register', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Username already exists',
        }),
      });
    });
    
    // Fill registration form
    await page.getByPlaceholder('Enter your username').fill('existinguser');
    await page.getByPlaceholder('Enter your email').fill('existing@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    // Should display error message
    await expect(page.getByText('Username already exists')).toBeVisible();
    
    // Should remain on register page
    await expect(page).toHaveURL('/register');
  });

  test('should handle session timeout during activity', async ({ page }) => {
    // Mock initial authentication
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Mock accounts data initially
    await page.route('**/api/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });
    
    // Mock transactions data
    await page.route('**/api/transactions/recent*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });
    
    // Set up authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'fake-jwt-token');
    });
    
    // Navigate to dashboard
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back, testuser!')).toBeVisible();
    
    // Change API to return 401 (simulating session timeout)
    await page.route('**/api/accounts', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Session expired',
        }),
      });
    });
    
    // Navigate to accounts page (should trigger session timeout)
    await page.getByRole('link', { name: 'View all accounts' }).click();
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
  });

  test('should preserve intended destination after login', async ({ page }) => {
    // Try to access protected route without authentication
    await page.goto('/accounts');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login');
    
    // Login successfully
    await page.getByPlaceholder('Enter your username or email').fill('testuser');
    await page.getByPlaceholder('Enter your password').fill('password123');
    
    // Mock successful login
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            token: 'fake-jwt-token',
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Mock profile endpoint
    await page.route('**/api/users/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            roles: 'USER',
          },
        }),
      });
    });
    
    // Mock accounts data
    await page.route('**/api/accounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });
    
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    // Should redirect to originally intended destination
    await expect(page).toHaveURL('/accounts');
  });
});