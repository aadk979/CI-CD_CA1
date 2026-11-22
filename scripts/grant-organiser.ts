/**
 * Grant (or revoke) the organiser role (SCRUM-24). Sign-up always creates fans, so this is
 * the only way to make an organiser: register normally, then run
 *
 *   npm run organiser:grant -- someone@example.com
 *   npm run organiser:grant -- someone@example.com --revoke
 *
 * It takes effect on the user's next request; they don't need to log in again.
 */
import { loadEnv } from '../src/lib/load-env';

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const role = args.includes('--revoke') ? 'FAN' : 'ORGANISER';
  if (!email) {
    console.error('Usage: npm run organiser:grant -- <email> [--revoke]');
    process.exit(2);
  }

  const { getPrisma, disconnectPrisma } = await import('../src/lib/db');
  const { setUserRole } = await import('../src/lib/organiser');
  const found = await setUserRole(getPrisma(), email, role);
  await disconnectPrisma();

  if (!found) {
    console.error(`No account with email ${email}. Register it first.`);
    process.exit(1);
  }
  console.log(`${email} is now ${role === 'ORGANISER' ? 'an organiser' : 'a fan'}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
