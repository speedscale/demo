'use client';

import React, { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/lib/auth/context';
import Button from '@/components/ui/Button';
import Link from 'next/link';

interface Transaction {
  id: number;
  accountId: number;
  accountNumber: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  amount: number;
  currency: string;
  description: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

const TransactionsPage: React.FC = () => {
  const { } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        // TODO: Replace with actual API call
        // Simulate API call with mock data
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockTransactions: Transaction[] = [
          {
            id: 1,
            accountId: 1,
            accountNumber: '1234567890',
            type: 'DEPOSIT',
            amount: 1000.00,
            currency: 'USD',
            description: 'Salary deposit',
            status: 'COMPLETED',
            createdAt: '2024-01-20T09:00:00Z',
            updatedAt: '2024-01-20T09:00:00Z',
          },
          {
            id: 2,
            accountId: 1,
            accountNumber: '1234567890',
            type: 'WITHDRAWAL',
            amount: 150.00,
            currency: 'USD',
            description: 'ATM withdrawal',
            status: 'COMPLETED',
            createdAt: '2024-01-19T14:30:00Z',
            updatedAt: '2024-01-19T14:30:00Z',
          },
          {
            id: 3,
            accountId: 2,
            accountNumber: '0987654321',
            type: 'TRANSFER',
            amount: 500.00,
            currency: 'USD',
            description: 'Transfer to savings',
            status: 'COMPLETED',
            createdAt: '2024-01-18T11:15:00Z',
            updatedAt: '2024-01-18T11:15:00Z',
          },
          {
            id: 4,
            accountId: 1,
            accountNumber: '1234567890',
            type: 'DEPOSIT',
            amount: 250.00,
            currency: 'USD',
            description: 'Check deposit',
            status: 'PENDING',
            createdAt: '2024-01-17T16:45:00Z',
            updatedAt: '2024-01-17T16:45:00Z',
          },
        ];
        
        setTransactions(mockTransactions);
      } catch {
        setError('Failed to load transactions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransactions();
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
        return (
          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
        );
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

  const filteredTransactions = transactions.filter((transaction) => {
    const typeMatch = filterType === 'ALL' || transaction.type === filterType;
    const statusMatch = filterStatus === 'ALL' || transaction.status === filterStatus;
    return typeMatch && statusMatch;
  });

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Transaction History</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    View all your banking transactions and activity
                  </p>
                </div>
                <div className="flex space-x-3">
                  <Button
                    variant="primary"
                    onClick={() => window.location.href = '/transactions/new'}
                  >
                    New Transaction
                  </Button>
                  <Link href="/dashboard">
                    <Button variant="outline">
                      Back to Dashboard
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-6 bg-white shadow rounded-lg p-4">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transaction Type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ALL">All Types</option>
                    <option value="DEPOSIT">Deposits</option>
                    <option value="WITHDRAWAL">Withdrawals</option>
                    <option value="TRANSFER">Transfers</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="ALL">All Status</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                <span className="ml-4 text-gray-600">Loading transactions...</span>
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

            {!isLoading && !error && filteredTransactions.length === 0 && (
              <div className="text-center py-12">
                <div className="w-24 h-24 mx-auto mb-4 text-gray-400">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
                <p className="text-gray-600 mb-4">
                  {filterType !== 'ALL' || filterStatus !== 'ALL' 
                    ? 'No transactions match your current filters' 
                    : 'Create your first transaction to get started'
                  }
                </p>
                <Button
                  variant="primary"
                  onClick={() => window.location.href = '/transactions/new'}
                >
                  Create Transaction
                </Button>
              </div>
            )}

            {!isLoading && !error && filteredTransactions.length > 0 && (
              <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                  {filteredTransactions.map((transaction) => (
                    <li key={transaction.id} className="px-4 py-4 sm:px-6">
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
                              Account: {transaction.accountNumber}
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
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isLoading && !error && filteredTransactions.length > 0 && (
              <div className="mt-6 bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-600">Total Transactions</p>
                    <p className="text-2xl font-bold text-blue-900">{filteredTransactions.length}</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-600">Total Deposits</p>
                    <p className="text-2xl font-bold text-green-900">
                      {formatCurrency(
                        filteredTransactions
                          .filter(t => t.type === 'DEPOSIT')
                          .reduce((sum, t) => sum + t.amount, 0),
                        'USD'
                      )}
                    </p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-600">Total Withdrawals</p>
                    <p className="text-2xl font-bold text-red-900">
                      {formatCurrency(
                        filteredTransactions
                          .filter(t => t.type === 'WITHDRAWAL')
                          .reduce((sum, t) => sum + t.amount, 0),
                        'USD'
                      )}
                    </p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm font-medium text-purple-600">Pending</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {filteredTransactions.filter(t => t.status === 'PENDING').length}
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

export default TransactionsPage;