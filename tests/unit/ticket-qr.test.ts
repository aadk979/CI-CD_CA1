import { describe, expect, it } from 'vitest';
import { parseTicketQr, ticketQrDataUri, ticketQrPayload } from '@/lib/ticket-qr';

describe('ticket QR codes (SCRUM-41)', () => {
  it('round-trips a ticket id through the payload', () => {
    expect(parseTicketQr(ticketQrPayload('cm1abc23def'))).toBe('cm1abc23def');
  });

  it('rejects payloads that are not ours', () => {
    expect(parseTicketQr('https://example.com')).toBeNull();
    expect(parseTicketQr('TIXQUEUE:')).toBeNull();
    expect(parseTicketQr('TIXQUEUE:abc def')).toBeNull();
  });

  it('renders a scannable SVG data URI that differs per ticket', async () => {
    const a = await ticketQrDataUri('ticketa');
    const b = await ticketQrDataUri('ticketb');
    expect(a).toMatch(/^data:image\/svg\+xml;base64,/);
    const svg = Buffer.from(a.split(',')[1], 'base64').toString();
    expect(svg).toContain('<svg');
    expect(a).not.toBe(b);
  });
});
