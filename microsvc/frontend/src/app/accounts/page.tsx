'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/lib/auth/context';
import Button from '@/components/ui/Button';
import Link from 'next/link';

interface Account {
  id: number;
  accountNumber: string;
  accountType: string;
  balance: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const AccountsPage: React.FC = () => {
  const { } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        // TODO: Replace with actual API call
        // Simulate API call with mock data
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockAccounts: Account[] = [
          {
            id: 1,
            accountNumber: '1234567890',
            accountType: 'CHECKING',
            balance: 2500.50,
            currency: 'USD',
            status: 'ACTIVE',
            createdAt: '2024-01-15T10:30:00Z',
            updatedAt: '2024-01-15T10:30:00Z',
          },
          {
            id: 2,
            accountNumber: '0987654321',
            accountType: 'SAVINGS',
            balance: 10000.00,
            currency: 'USD',
            status: 'ACTIVE',
            createdAt: '2024-02-01T14:20:00Z',
            updatedAt: '2024-02-01T14:20:00Z',
          },
        ];
        
        setAccounts(mockAccounts);
      } catch {
        setError('Failed to load accounts');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Your Accounts</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    Manage your banking accounts and view balances
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="primary"
                    onClick={() => window.location.href = '/accounts/new'}
                  >
                    Create New Account
                  </Button>
                  <Link href="/dashboard">
                    <Button variant="outline">
                      Back to Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <span className="ml-4 text-gray-600">Loading accounts...</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Error</h3>
                    <div className="mt-2 text-sm text-red-700">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && !error && accounts.length === 0 && (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto mb-4 text-gray-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2m-6 4h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts found</h3>
                <p className="text-gray-600 mb-4">Create your first account to get started</p>
                <Button
                  variant="primary"
                  onClick={() => window.location.href = '/accounts/new'}
                >
                  Create Account
                </Button>
              </div>
            )}

            {!isLoading && !error && accounts.length > 0 && (
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {accounts.map((account) => (
                    <li key={account.id}>
                      <Link
                        href={`/accounts/${account.id}`}
                        className="block hover:bg-gray-50 px-4 py-4 sm:px-6"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-blue-600 truncate">
                                  {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1).toLowerCase()} Account
                                </p>
                                <p className="text-sm text-gray-500">
                                  Account #: {account.accountNumber}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-semibold text-gray-900">
                                  {formatCurrency(account.balance, account.currency)}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {account.status}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2">
                              <div className="flex justify-between text-sm text-gray-500">
                                <span>Created: {formatDate(account.createdAt)}</span>
                                <span>Updated: {formatDate(account.updatedAt)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="ml-4 flex-shrink-0">
                            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isLoading && !error && accounts.length > 0 && (
              <div className="mt-6 bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Account Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-600">Total Accounts</p>
                    <p className="text-2xl font-bold text-blue-900">{accounts.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-600">Total Balance</p>
                    <p className="text-2xl font-bold text-green-900">
                      {formatCurrency(
                        accounts.reduce((sum, account) => sum + account.balance, 0),
                        'USD'
                      )}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-purple-600">Active Accounts</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {accounts.filter(account => account.status === 'ACTIVE').length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default AccountsPage;