import { ForbiddenNotice } from '@/components/forbidden-notice';

/** Rendered when a page or Server Action calls `forbidden()` (requires `authInterrupts`). */
export default function Forbidden() {
  return <ForbiddenNotice />;
}
