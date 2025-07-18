import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username or email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await expect(page.getByText('Username or email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('should show validation error for short password', async ({ page }) => {
    await page.getByPlaceholder('Enter your username or email').fill('testuser');
    await page.getByPlaceholder('Enter your password').fill('123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.getByRole('link', { name: 'create a new account' }).click();
    await expect(page).toHaveURL('/register');
  });

  test('should show loading state during login', async ({ page }) => {
    // Mock a slow API response
    await page.route('**/api/auth/login', async (route) => {
      await page.waitForTimeout(2000);
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

    await page.getByPlaceholder('Enter your username or email').fill('testuser');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await expect(page.getByText('Signing in...')).toBeVisible();
  });

  test('should display error message for invalid credentials', async ({ page }) => {
    // Mock failed login response
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid credentials',
        }),
      });
    });

    await page.getByPlaceholder('Enter your username or email').fill('testuser');
    await page.getByPlaceholder('Enter your password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });

  test('should redirect to dashboard on successful login', async ({ page }) => {
    // Mock successful login response
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

    // Mock profile endpoint for auth context
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

    await page.getByPlaceholder('Enter your username or email').fill('testuser');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await expect(page).toHaveURL('/dashboard');
  });

  test('should remember me checkbox work', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: 'Remember me' });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    
    await checkbox.click();
    await expect(checkbox).toBeChecked();
  });

  test('should have forgot password link', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username or email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
});