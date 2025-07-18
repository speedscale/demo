'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  userId: number;
}

interface Transaction {
  id: number;
  accountId: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  amount: number;
  currency: string;
  description: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

const AccountDetailsPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(true);

  const accountId = params.id as string;

  useEffect(() => {
    const fetchAccountDetails = async () => {
      try {
        // TODO: Replace with actual API call
        // Simulate API call with mock data
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockAccount: Account = {
          id: parseInt(accountId),
          accountNumber: accountId === '1' ? '1234567890' : '0987654321',
          accountType: accountId === '1' ? 'CHECKING' : 'SAVINGS',
          balance: accountId === '1' ? 2500.50 : 10000.00,
          currency: 'USD',
          status: 'ACTIVE',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
          userId: user?.id || 1,
        };
        
        setAccount(mockAccount);
      } catch {
        setError('Failed to load account details');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAccountTransactions = async () => {
      try {
        // TODO: Replace with actual API call
        // Simulate API call with mock data
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const mockTransactions: Transaction[] = [
          {
            id: 1,
            accountId: parseInt(accountId),
            type: 'DEPOSIT' as const,
            amount: 1000.00,
            currency: 'USD',
            description: 'Salary deposit',
            status: 'COMPLETED' as const,
            createdAt: '2024-01-20T09:00:00Z',
            updatedAt: '2024-01-20T09:00:00Z',
          },
          {
            id: 2,
            accountId: parseInt(accountId),
            type: 'WITHDRAWAL' as const,
            amount: 150.00,
            currency: 'USD',
            description: 'ATM withdrawal',
            status: 'COMPLETED' as const,
            createdAt: '2024-01-19T14:30:00Z',
            updatedAt: '2024-01-19T14:30:00Z',
          },
          {
            id: 3,
            accountId: parseInt(accountId),
            type: 'TRANSFER' as const,
            amount: 500.00,
            currency: 'USD',
            description: 'Transfer to savings',
            status: 'COMPLETED' as const,
            createdAt: '2024-01-18T11:15:00Z',
            updatedAt: '2024-01-18T11:15:00Z',
          },
        ].filter(t => t.accountId === parseInt(accountId));
        
        setTransactions(mockTransactions);
      } catch (err) {
        console.error('Failed to load transactions:', err);
      } finally {
        setTransactionsLoading(false);
      }
    };

    if (accountId) {
      fetchAccountDetails();
      fetchAccountTransactions();
    }
  }, [accountId, user?.id]);

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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        );
      case 'WITHDRAWAL':
        return (
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </div>
        );
      case 'TRANSFER':
        return (
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Completed</span>;
      case 'PENDING':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
      case 'FAILED':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Failed</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Unknown</span>;
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute requireAuth={true}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading account details...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !account) {
    return (
      <ProtectedRoute requireAuth={true}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4 text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {error || 'Account not found'}
            </h3>
            <p className="text-gray-600 mb-4">
              The account you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to view it.
            </p>
            <Link href="/accounts">
              <Button variant="primary">
                Back to Accounts
              </Button>
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Account Details</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1).toLowerCase()} Account
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/accounts/${account.id}/transactions/new`)}
                  >
                    New Transaction
                  </Button>
                  <Link href="/accounts">
                    <Button variant="outline">
                      Back to Accounts
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Account Summary Card */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm font-medium text-gray-600">Account Number</p>
                  <p className="text-lg font-semibold text-gray-900">{account.accountNumber}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Current Balance</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(account.balance, account.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Account Type</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1).toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Status</p>
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                    account.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {account.status}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Account opened: {formatDate(account.createdAt)}</span>
                  <span>Last updated: {formatDate(account.updatedAt)}</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white shadow rounded-lg p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/accounts/${account.id}/deposit`)}
                  className="flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Make Deposit
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/accounts/${account.id}/withdraw`)}
                  className="flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                  Withdraw Funds
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/accounts/${account.id}/transfer`)}
                  className="flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Transfer Money
                </Button>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">Recent Transactions</h3>
                  <Link href={`/transactions?accountId=${account.id}`}>
                    <Button variant="outline" size="sm">
                      View All
                    </Button>
                  </Link>
                </div>
              </div>

              {transactionsLoading ? (
                <div className="px-6 py-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Loading transactions...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 text-gray-400">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No transactions yet</h4>
                  <p className="text-gray-600 mb-4">This account has no transaction history.</p>
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/accounts/${account.id}/transactions/new`)}
                  >
                    Create First Transaction
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getTransactionIcon(transaction.type)}
                          <div className="ml-4">
                            <div className="flex items-center">
                              <p className="text-sm font-medium text-gray-900">
                                {transaction.description}
                              </p>
                              <div className="ml-2">
                                {getStatusBadge(transaction.status)}
                              </div>
                            </div>
                            <div className="mt-1 text-sm text-gray-500">
                              <span className="capitalize">{transaction.type.toLowerCase()}</span>
                              {' • '}
                              {formatDate(transaction.createdAt)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-semibold ${
                            transaction.type === 'DEPOSIT' ? 'text-green-600' : 
                            transaction.type === 'WITHDRAWAL' ? 'text-red-600' : 
                            'text-blue-600'
                          }`}>
                            {transaction.type === 'DEPOSIT' ? '+' : '-'}
                            {formatCurrency(transaction.amount, transaction.currency)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {transactions.length > 5 && (
                    <div className="px-6 py-4 bg-gray-50 text-center">
                      <Link href={`/transactions?accountId=${account.id}`}>
                        <Button variant="outline" size="sm">
                          View {transactions.length - 5} more transactions
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default AccountDetailsPage;