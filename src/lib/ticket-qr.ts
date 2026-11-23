import QRCode from 'qrcode';

/** What a gate scanner reads: an opaque, unguessable ticket id (cuid), nothing personal. */
export function ticketQrPayload(ticketId: string): string {
  return `TIXQUEUE:${ticketId}`;
}

/** Inverse of ticketQrPayload; null for anything that isn't one of our codes. */
export function parseTicketQr(payload: string): string | null {
  const match = /^TIXQUEUE:([a-z0-9]+)$/i.exec(payload.trim());
  return match ? match[1] : null;
}

/** An SVG data URI, so it can go in <img src> with no raw HTML injection. */
export async function ticketQrDataUri(ticketId: string): Promise<string> {
  const svg = await QRCode.toString(ticketQrPayload(ticketId), {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
