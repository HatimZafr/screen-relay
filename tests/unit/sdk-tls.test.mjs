import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { createServer, globalAgent } from 'node:https';
import { createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capabilities, createClient } from '../../dist/sdk/index.js';

const skip = spawnSync('openssl', ['version'], { stdio: 'ignore' }).status === 0 ? false : 'openssl is required to generate test certificates';
const token = 'ab'.repeat(32);
const rejected = { reason: 'unreachable', message: 'The TLS certificate was rejected.' };

test('TLS trust modes', { skip }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'screen-relay-tls-'));
  const file = (name) => join(directory, name);
  const openssl = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.pem', '-subj', '/CN=screen-relay-test-ca', '-days', '2');
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'self.key', '-out', 'self.pem', '-subj', '/CN=desktop.example', '-days', '2');
  for (const name of ['localhost', 'other.example']) {
    writeFileSync(file(`${name}.ext`), `subjectAltName=DNS:${name}`);
    openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-out', `${name}.csr`, '-subj', `/CN=${name}`);
    openssl('x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.pem`, '-days', '2', '-extfile', `${name}.ext`);
  }
  writeFileSync(file('fullchain.pem'), Buffer.concat([readFileSync(file('other.example.pem')), readFileSync(file('ca.pem'))]));
  writeFileSync(file('self-leaf.pem'), readFileSync(file('self.pem'), 'utf8').trim());

  const servers = new Map();
  const ports = {};
  for (const [label, name] of [['localhost', 'localhost'], ['other.example', 'other.example'], ['self', 'self'], ['self-second', 'self']]) {
    const server = createServer({ key: readFileSync(file(`${name}.key`)), cert: readFileSync(file(`${name}.pem`)) }, (request, response) => {
      server.requests += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ served: name }));
    });
    server.requests = 0;
    server.connections = 0;
    server.on('connection', () => { server.connections += 1; });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.set(label, server);
    ports[label] = server.address().port;
  }

  try {
    await t.test('a CA file still checks the URL host name', async () => {
      await assert.rejects(createClient({ url: `https://localhost:${ports['other.example']}`, connect: '127.0.0.1', ca: file('ca.pem'), token }).status(), rejected);
      await assert.rejects(createClient({ url: `https://127.0.0.1:${ports['other.example']}`, ca: file('ca.pem'), token }).status(), rejected);
      await assert.rejects(createClient({ url: `https://127.0.0.1:${ports['other.example']}`, ca: file('fullchain.pem'), token }).status(), rejected);
      assert.equal(servers.get('other.example').requests, 0);
      assert.deepEqual(await createClient({ url: `https://localhost:${ports.localhost}`, connect: '127.0.0.1', ca: file('ca.pem') }).status(), { served: 'localhost' });
    });

    await t.test('connect changes the dial address, not the name the certificate must match', async () => {
      const before = servers.get('localhost').requests;
      await assert.rejects(createClient({ url: `https://desktop.example:${ports.localhost}`, connect: '127.0.0.1', ca: file('ca.pem'), token }).status(), rejected);
      assert.equal(servers.get('localhost').requests, before);
    });

    await t.test('a pinned certificate is required exactly and skips the host name check', async () => {
      assert.deepEqual(await createClient({ url: `https://127.0.0.1:${ports.self}`, certificate: file('self.pem') }).status(), { served: 'self' });
      assert.deepEqual(await createClient({ url: `https://127.0.0.1:${ports['other.example']}`, certificate: file('other.example.pem') }).status(), { served: 'other.example' });
      assert.deepEqual(await createClient({ url: `https://127.0.0.1:${ports['other.example']}`, certificate: file('fullchain.pem') }).status(), { served: 'other.example' });
      const before = servers.get('other.example').requests;
      await assert.rejects(createClient({ url: `https://127.0.0.1:${ports['other.example']}`, certificate: file('localhost.pem'), token }).status(), rejected);
      assert.equal(servers.get('other.example').requests, before);
    });

    for (const [ending, code] of [['timeout', 'TIMEOUT'], ['abort', 'CANCELED'], ['close', 'NETWORK_ERROR']]) await t.test(`pinned TLS handshakes settle and close on ${ending}`, async () => {
      const sockets = new Set();
      const closed = [];
      let connected;
      const accepted = new Promise((resolve) => { connected = resolve; });
      const server = tcpServer((socket) => {
        sockets.add(socket);
        closed.push(once(socket, 'close'));
        if (closed.length === 2) connected();
        socket.on('close', () => sockets.delete(socket));
        socket.resume();
        if (ending === 'close') socket.destroy();
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const controller = new AbortController();
      const client = createClient({ url: `https://127.0.0.1:${server.address().port}`, certificate: file('self.pem'), timeout: ending === 'timeout' ? 50 : 10_000, signal: controller.signal });
      let watchdog;
      const deadline = new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('Pinned TLS handshake exceeded the request deadline')), 500);
      });
      try {
        const result = Promise.all([client.status(), client.capabilities()].map((operation) => assert.rejects(operation, { code })));
        if (ending === 'abort') {
          await Promise.race([accepted, deadline]);
          controller.abort();
        }
        await Promise.race([result, deadline]);
        assert.equal(closed.length, 2);
        await Promise.race([Promise.all(closed), deadline]);
        assert.equal(sockets.size, 0);
      } finally {
        clearTimeout(watchdog);
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve) => server.close(resolve));
      }
    });

    await t.test('custom TLS requests do not use the shared HTTPS agent', async () => {
      const addRequest = globalAgent.addRequest;
      let shared = 0;
      globalAgent.addRequest = function (...args) {
        shared += 1;
        return addRequest.apply(this, args);
      };
      try {
        await createClient({ url: `https://127.0.0.1:${ports['self-second']}`, certificate: file('self.pem') }).status();
      } finally {
        globalAgent.addRequest = addRequest;
      }
      assert.equal(shared, 0);
    });

    await t.test('a custom TLS client reuses its connection', async () => {
      const server = servers.get('self-second');
      const before = server.connections;
      const client = createClient({ url: `https://127.0.0.1:${ports['self-second']}`, certificate: file('self.pem') });
      await client.status();
      await client.status();
      assert.equal(server.connections, before + 1);
    });

    await t.test('a reused connection cannot skip a different verification policy', async () => {
      assert.deepEqual(await createClient({ url: `https://127.0.0.1:${ports.self}`, certificate: file('self-leaf.pem') }).status(), { served: 'self' });
      await assert.rejects(createClient({ url: `https://127.0.0.1:${ports.self}`, ca: file('self-leaf.pem') }).status(), rejected);
    });

    await t.test('ca and certificate cannot be combined', async () => {
      assert.throws(() => createClient({ url: 'https://127.0.0.1:1', ca: 'ca.pem', certificate: 'cert.pem' }), { code: 'INVALID_ARGUMENT', message: /Pass ca or certificate, not both/ });
    });

    await t.test('an unreadable certificate file is an io error', async () => {
      await assert.rejects(capabilities({ url: 'https://127.0.0.1:1', certificate: '/nonexistent/relay-cert.pem' }), { code: 'IO_ERROR' });
    });
  } finally {
    for (const server of servers.values()) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
