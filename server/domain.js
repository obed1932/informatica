import { createHash, timingSafeEqual } from 'node:crypto';
import { PNG } from 'pngjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function tokenMatches(row, id, token) {
  if (!isUuid(id) || typeof token !== 'string' || token.length < 32 || token.length > 128 || !row) return false;
  const stored = Buffer.from(String(row.token_sha256), 'hex');
  const received = Buffer.from(sha256(token), 'hex');
  return stored.length === 32 && timingSafeEqual(stored, received);
}

export function publicState(row, now = Date.now()) {
  const expiry = String(row.expires_at).replace(' ', 'T') + 'Z';
  return row.state === 'PENDING' && Date.parse(expiry) <= now ? 'EXPIRED' : row.state;
}

export function validSigner(input, requester) {
  if (typeof requester !== 'string' || !requester.trim() || requester.length > 200) throw new HttpError(422, 'Solicitante no disponible');
  const thirdParty = input.signer_is_third_party ?? false;
  if (typeof thirdParty !== 'boolean') throw new HttpError(422, 'Tipo de firmante no válido');
  if (!thirdParty) {
    if (input.signer_name != null && input.signer_name !== '') throw new HttpError(422, 'El nombre del solicitante no puede modificarse');
    return { name: requester.trim(), thirdParty: false };
  }
  if (typeof input.signer_name !== 'string') throw new HttpError(422, 'Indique el nombre completo de la otra persona que firma');
  const name = input.signer_name.trim().replace(/\s+/gu, ' ');
  if (name.length < 5 || name.length > 200 || !/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)
    || name.split(' ').length < 2 || name.toLocaleLowerCase('es-PE') === requester.trim().toLocaleLowerCase('es-PE')) {
    throw new HttpError(422, 'Indique el nombre completo de la otra persona que firma');
  }
  return { name, thirdParty: true };
}

export function signatureBytes(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new HttpError(422, 'Firma no válida');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 80 || bytes.length > 300_000 || bytes.toString('base64') !== encoded || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new HttpError(422, 'Firma PNG no válida');
  try {
    const png = PNG.sync.read(bytes, { checkCRC: true });
    if (png.width < 100 || png.width > 1600 || png.height < 1 || png.height > 900) throw new Error('dimensions');
  } catch { throw new HttpError(422, 'Dimensiones de firma no válidas'); }
  return bytes;
}

export function publicPayload(row) {
  const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
  const equipment = snapshot.equipo || {};
  return {
    state: publicState(row), request_uuid: row.request_uuid, order_code: row.order_code,
    version: Number(row.document_version), document_sha256: row.document_sha256,
    expires_at: String(row.expires_at).replace(' ', 'T') + 'Z',
    service: snapshot.servicio || '', requester: snapshot.solicitante || '',
    equipment: Object.fromEntries(['denominacion','marca','modelo','serie','codigo_patrimonial','hostname'].map(key => [key, equipment[key] || ''])),
    occurrence: snapshot.ocurrencia || '', diagnosis: snapshot.diagnostico || '',
    work: snapshot.trabajo_realizado || '', jobs: snapshot.trabajos || [],
    started_at: snapshot.fecha_inicio || null, ended_at: snapshot.fecha_termino || null,
  };
}
