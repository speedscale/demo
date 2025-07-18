'use client';

import React from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/lib/auth/context';
import Button from '@/components/ui/Button';

const DashboardPage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">
                  Welcome to your Dashboard
                </h1>
                
                {user && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-md">
                    <h2 className="text-lg font-medium text-blue-900 mb-2">
                      User Information
                    </h2>
                    <div className="text-sm text-blue-700 space-y-1">
                      <p><strong>ID:</strong> {user.id}</p>
                      <p><strong>Username:</strong> {user.username}</p>
                      <p><strong>Email:</strong> {user.email}</p>
                      <p><strong>Roles:</strong> {user.roles}</p>
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Banking Features
                      </h3>
                      <p className="text-sm text-gray-600">
                        Manage your accounts and transactions
                      </p>
                    </div>
                    <div className="flex space-x-3">
                      <Button
                        variant="outline"
                        onClick={() => window.location.href = '/accounts'}
                      >
                        View Accounts
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => window.location.href = '/transactions'}
                      >
                        View Transactions
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={logout}
                      >
                        Logout
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default DashboardPage;