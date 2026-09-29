import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PNG } from 'pngjs';
import { HttpError, publicPayload, publicState, sha256, signatureBytes, tokenMatches, validSigner } from './domain.js';

test('token correcto y otro token no coincide', () => {
  const token = randomBytes(32).toString('hex');
  const row = { token_sha256: sha256(token) };
  assert.equal(tokenMatches(row, '11111111-2222-4333-8444-555555555555', token), true);
  assert.equal(tokenMatches(row, '11111111-2222-4333-8444-555555555555', randomBytes(32).toString('hex')), false);
});

test('caducidad y payload público sin token ni firma técnica', () => {
  const row = { state: 'PENDING', expires_at: '2026-01-01 00:00:00', request_uuid: '11111111-2222-4333-8444-555555555555',
    order_code: 'OTC-DEMO', document_version: 1, document_sha256: 'a'.repeat(64), token_sha256: 'b'.repeat(64),
    snapshot_json: JSON.stringify({ servicio: 'Archivo Clínico', solicitante: 'Persona Prueba', equipo: { marca: 'DELL', secreto: 'NO' }, firma_tecnico: 'NO' }) };
  assert.equal(publicState(row, Date.parse('2026-01-02T00:00:00Z')), 'EXPIRED');
  const output = publicPayload(row);
  assert.equal(output.service, 'Archivo Clínico');
  assert.equal(output.equipment.marca, 'DELL');
  assert.equal(JSON.stringify(output).includes('secreto'), false);
  assert.equal(JSON.stringify(output).includes('token_sha256'), false);
});

test('firmante tercero preserva identidad y evita suplantación nominal', () => {
  assert.deepEqual(validSigner({ signer_is_third_party: true, signer_name: 'Otra Persona' }, 'Persona Prueba'), { name: 'Otra Persona', thirdParty: true });
  assert.throws(() => validSigner({ signer_is_third_party: true, signer_name: 'Persona Prueba' }, 'Persona Prueba'), HttpError);
  assert.throws(() => validSigner({ signer_is_third_party: false, signer_name: 'Otra Persona' }, 'Persona Prueba'), HttpError);
});

test('firma PNG íntegra aceptada; firma dañada rechazada', () => {
  const png = new PNG({ width: 200, height: 100 });
  png.data.fill(255);
  const encoded = PNG.sync.write(png).toString('base64');
  assert.equal(signatureBytes(encoded).length > 80, true);
  assert.throws(() => signatureBytes(randomBytes(120).toString('base64')), HttpError);
});
