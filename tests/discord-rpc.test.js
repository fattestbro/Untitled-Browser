const test = require('node:test');
const assert = require('node:assert/strict');
const { validateApplicationId, encodeFrame, decodeFrames, FIXED_APPLICATION_ID } = require('../src/main/discord-rpc');
const { getRpcHost, getSearchQuery, cleanRpcText, pickRpcPhrase, formatMediaTime, buildDisplayTitle, isMediaHost } = require('../src/main/rpc-activity');

test('accepts a Discord application id as a string without numeric conversion', () => {
  assert.equal(validateApplicationId('123456789012345678').ok, true);
  assert.equal(validateApplicationId(' 123456789012345678\n').id, '123456789012345678');
});

test('rejects non-numeric application ids but does not impose a fake fixed length', () => {
  assert.equal(validateApplicationId('abc123').ok, false);
  assert.equal(validateApplicationId('123').ok, true);
});

test('encodes Discord IPC frames with little-endian opcode and length', () => {
  const frame = encodeFrame(0, { v: 1, client_id: '123456789012345678' });
  assert.equal(frame.readUInt32LE(0), 0);
  assert.equal(frame.readUInt32LE(4), frame.length - 8);
});

test('decodes fragmented frames', () => {
  const frame = encodeFrame(1, { cmd: 'DISPATCH', evt: 'READY' });
  const a = decodeFrames(frame.subarray(0, 5));
  assert.equal(a.packets.length, 0);
  const b = decodeFrames(Buffer.concat([a.remainder, frame.subarray(5)]));
  assert.deepEqual(b.packets[0].payload, { cmd: 'DISPATCH', evt: 'READY' });
});



test('extracts safe domains and search queries', () => {
  assert.equal(getRpcHost('https://www.YouTube.com/watch?v=123'), 'youtube.com');
  assert.equal(getRpcHost('untitled://settings'), '');
  assert.equal(getSearchQuery('https://www.google.com/search?q=how%20to%20fix%20it'), 'how to fix it');
  assert.equal(getSearchQuery('https://www.youtube.com/results?search_query=funny%20cats'), 'funny cats');
  assert.equal(getSearchQuery('https://github.com/search?q=electron'), '');
});

test('sanitizes presence text and rotates deterministic phrases', () => {
  assert.equal(cleanRpcText(' hello\n\tworld '), 'hello world');
  assert.equal(pickRpcPhrase(1, 'youtube.com', 0), pickRpcPhrase(1, 'youtube.com', 0));
});


test('formats media metadata safely for rich presence', () => {
  assert.equal(formatMediaTime(83), '1:23');
  assert.equal(formatMediaTime(3723), '1:02:03');
  assert.equal(buildDisplayTitle('My video - YouTube'), 'My video');
  assert.equal(isMediaHost('youtube.com'), true);
  assert.equal(isMediaHost('example.com'), false);
});

test('browser Discord application id is fixed',()=>assert.equal(FIXED_APPLICATION_ID,'1555622761924272249'));
