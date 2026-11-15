import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Log in"
      footer={{ text: 'New here?', linkText: 'Create an account', href: '/register' }}
    >
      <LoginForm />
    </AuthCard>
  );
}
