import Link from 'next/link';

export default function EventNotFound() {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Event not found</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        This event doesn&apos;t exist or is no longer listed.
      </p>
      <Link href="/" className="mt-4 inline-block font-medium underline">
        Browse upcoming events
      </Link>
    </div>
  );
}
