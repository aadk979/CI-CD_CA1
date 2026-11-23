import type { PrismaClient } from '@/generated/prisma/client';
import { formatEventDate, formatPrice } from './format';

/**
 * Order confirmation email (SCRUM-42). The message is built here (pure, unit-tested);
 * a BullMQ job loads the order and hands the message to an EmailSender. Like payments,
 * delivery is simulated: the default sender writes the email to the worker log, and a real
 * provider (SES, SMTP) only has to implement EmailSender.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

export interface OrderForEmail {
  id: string;
  recipientName: string;
  recipientEmail: string;
  totalCents: number;
  currency: string;
  event: { title: string; startsAt: Date; venue: string; city: string };
  seats: { section: string; row: string; number: number; tierName: string }[];
}

export async function getOrderForEmail(
  prisma: PrismaClient,
  orderId: string,
): Promise<OrderForEmail | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      totalCents: true,
      currency: true,
      user: { select: { name: true, email: true } },
      event: {
        select: {
          title: true,
          startsAt: true,
          venue: { select: { name: true, city: true } },
        },
      },
      tickets: {
        select: {
          tierName: true,
          seat: { select: { row: true, number: true, section: { select: { name: true } } } },
        },
      },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    recipientName: order.user.name,
    recipientEmail: order.user.email,
    totalCents: order.totalCents,
    currency: order.currency,
    event: {
      title: order.event.title,
      startsAt: order.event.startsAt,
      venue: order.event.venue.name,
      city: order.event.venue.city,
    },
    seats: order.tickets
      .map((t) => ({
        section: t.seat.section.name,
        row: t.seat.row,
        number: t.seat.number,
        tierName: t.tierName,
      }))
      .sort(
        (a, b) =>
          a.section.localeCompare(b.section) ||
          a.row.localeCompare(b.row, undefined, { numeric: true }) ||
          a.number - b.number,
      ),
  };
}

export function buildOrderConfirmation(order: OrderForEmail): EmailMessage {
  const seats = order.seats
    .map((s) => `  - ${s.section}, Row ${s.row}, Seat ${s.number} (${s.tierName})`)
    .join('\n');
  const count = order.seats.length;

  return {
    to: order.recipientEmail,
    subject: `Your tickets for ${order.event.title}`,
    text: [
      `Hi ${order.recipientName},`,
      '',
      `Thanks for your order! Your ${count} ticket${count === 1 ? ' is' : 's are'} confirmed.`,
      '',
      order.event.title,
      `${formatEventDate(order.event.startsAt)} · ${order.event.venue}, ${order.event.city}`,
      '',
      'Seats:',
      seats,
      '',
      `Total paid: ${formatPrice(order.totalCents, order.currency)}`,
      `Order reference: ${order.id}`,
      '',
      'Your QR codes are under "My tickets" on the site.',
    ].join('\n'),
  };
}

/** Simulated delivery: the email goes to the worker log instead of a mail server. */
export const logEmailSender: EmailSender = async ({ to, subject, text }) => {
  console.log(`Email to ${to}: ${subject}\n${text}`);
};
