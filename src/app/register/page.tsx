import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth/auth-card';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: 'Create an account' };

// Static shell: the form is a Client Component that posts to a Server Action.
export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      footer={{ text: 'Already have an account?', linkText: 'Log in', href: '/login' }}
    >
      <RegisterForm />
    </AuthCard>
  );
}
