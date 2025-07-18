'use client';

import React from 'react';
import LoginForm from '@/components/auth/LoginForm';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const LoginPage: React.FC = () => {
  return (
    <ProtectedRoute requireAuth={false}>
      <LoginForm />
    </ProtectedRoute>
  );
};

export default LoginPage;