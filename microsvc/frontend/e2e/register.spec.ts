import { test, expect } from '@playwright/test';

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('should display register form', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Username is required')).toBeVisible();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
    await expect(page.getByText('Password confirmation is required')).toBeVisible();
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.getByPlaceholder('Enter your email').fill('invalid-email');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Please enter a valid email address')).toBeVisible();
  });

  test('should show validation error for short username', async ({ page }) => {
    await page.getByPlaceholder('Enter your username').fill('ab');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Username must be at least 3 characters')).toBeVisible();
  });

  test('should show validation error for short password', async ({ page }) => {
    await page.getByPlaceholder('Enter your password').fill('123');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('should show validation error for password mismatch', async ({ page }) => {
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password456');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('should show validation error for invalid username characters', async ({ page }) => {
    await page.getByPlaceholder('Enter your username').fill('test-user!');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Username can only contain letters, numbers, and underscores')).toBeVisible();
  });

  test('should navigate to login page', async ({ page }) => {
    await page.getByRole('link', { name: 'sign in to your account' }).click();
    await expect(page).toHaveURL('/login');
  });

  test('should show loading state during registration', async ({ page }) => {
    // Mock a slow API response
    await page.route('**/api/auth/register', async (route) => {
      await page.waitForTimeout(2000);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Registration successful',
        }),
      });
    });

    await page.getByPlaceholder('Enter your username').fill('testuser');
    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Creating account...')).toBeVisible();
  });

  test('should display error message for existing username', async ({ page }) => {
    // Mock failed registration response
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

    await page.getByPlaceholder('Enter your username').fill('existinguser');
    await page.getByPlaceholder('Enter your email').fill('test@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Username already exists')).toBeVisible();
  });

  test('should display success message on successful registration', async ({ page }) => {
    // Mock successful registration response
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

    await page.getByPlaceholder('Enter your username').fill('newuser');
    await page.getByPlaceholder('Enter your email').fill('newuser@example.com');
    await page.getByPlaceholder('Enter your password').fill('password123');
    await page.getByPlaceholder('Confirm your password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    
    await expect(page.getByText('Registration successful. Please check your email to verify your account.')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByPlaceholder('Confirm your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });
});