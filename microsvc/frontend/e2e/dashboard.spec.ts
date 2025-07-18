import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
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
          data: [
            {
              id: 1,
              accountNumber: '1234567890',
              accountType: 'CHECKING',
              balance: 1000,
              currency: 'USD',
              status: 'ACTIVE',
            },
            {
              id: 2,
              accountNumber: '1234567891',
              accountType: 'SAVINGS',
              balance: 5000,
              currency: 'USD',
              status: 'ACTIVE',
            },
          ],
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
          data: [
            {
              id: 1,
              accountId: 1,
              type: 'DEPOSIT',
              amount: 1000,
              description: 'Initial deposit',
              status: 'COMPLETED',
              createdAt: '2023-01-01T10:00:00Z',
            },
            {
              id: 2,
              accountId: 1,
              type: 'WITHDRAWAL',
              amount: 100,
              description: 'ATM withdrawal',
              status: 'COMPLETED',
              createdAt: '2023-01-02T10:00:00Z',
            },
          ],
        }),
      });
    });

    // Set up authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('auth_token', 'fake-jwt-token');
    });

    await page.goto('/dashboard');
  });

  test('should display dashboard heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should display user accounts', async ({ page }) => {
    await expect(page.getByText('Your Accounts')).toBeVisible();
    await expect(page.getByText('CHECKING')).toBeVisible();
    await expect(page.getByText('SAVINGS')).toBeVisible();
    await expect(page.getByText('$1,000.00')).toBeVisible();
    await expect(page.getByText('$5,000.00')).toBeVisible();
  });

  test('should display account numbers', async ({ page }) => {
    await expect(page.getByText('****7890')).toBeVisible();
    await expect(page.getByText('****7891')).toBeVisible();
  });

  test('should display recent transactions', async ({ page }) => {
    await expect(page.getByText('Recent Transactions')).toBeVisible();
    await expect(page.getByText('Initial deposit')).toBeVisible();
    await expect(page.getByText('ATM withdrawal')).toBeVisible();
    await expect(page.getByText('DEPOSIT')).toBeVisible();
    await expect(page.getByText('WITHDRAWAL')).toBeVisible();
  });

  test('should navigate to accounts page', async ({ page }) => {
    await page.getByRole('link', { name: 'View all accounts' }).click();
    await expect(page).toHaveURL('/accounts');
  });

  test('should navigate to transactions page', async ({ page }) => {
    await page.getByRole('link', { name: 'View all transactions' }).click();
    await expect(page).toHaveURL('/transactions');
  });

  test('should display total balance', async ({ page }) => {
    await expect(page.getByText('Total Balance')).toBeVisible();
    await expect(page.getByText('$6,000.00')).toBeVisible();
  });

  test('should display account summary cards', async ({ page }) => {
    await expect(page.getByText('Total Accounts')).toBeVisible();
    await expect(page.getByText('2')).toBeVisible();
  });

  test('should navigate to create account page', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/accounts/create');
  });

  test('should navigate to create transaction page', async ({ page }) => {
    await page.getByRole('button', { name: 'New Transaction' }).click();
    await expect(page).toHaveURL('/transactions/create');
  });

  test('should display user greeting', async ({ page }) => {
    await expect(page.getByText('Welcome back, testuser!')).toBeVisible();
  });

  test('should handle loading state', async ({ page }) => {
    // Mock slow API response
    await page.route('**/api/accounts', async (route) => {
      await page.waitForTimeout(1000);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.reload();
    await expect(page.getByText('Loading...')).toBeVisible();
  });

  test('should handle empty accounts state', async ({ page }) => {
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

    await page.reload();
    await expect(page.getByText('No accounts found')).toBeVisible();
    await expect(page.getByText('Create your first account to get started')).toBeVisible();
  });

  test('should handle empty transactions state', async ({ page }) => {
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

    await page.reload();
    await expect(page.getByText('No recent transactions')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Your Accounts')).toBeVisible();
    await expect(page.getByText('Recent Transactions')).toBeVisible();
  });

  test('should logout user', async ({ page }) => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL('/login');
  });
});