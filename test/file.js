'use strict';

const ChildProcess = require('child_process');
const Fs = require('fs');
const Os = require('os');
const Path = require('path');

const Boom = require('@hapi/boom');
const Code = require('@hapi/code');
const File = require('@hapi/file');
const Hapi = require('@hapi/hapi');
const Hoek = require('@hapi/hoek');
const Inert = require('..');
const Lab = require('@hapi/lab');

const InertFs = require('../lib/fs');


const internals = {};


const lab = exports.lab = Lab.script();
const { describe, it } = lab;
const expect = Code.expect;


describe('file', () => {

    describe('handler()', () => {

        const provisionServer = async (options, etagsCacheMaxSize) => {

            const defaults = { compression: { minBytes: 1 }, plugins: { inert: { etagsCacheMaxSize } } };
            const server = new Hapi.Server(Hoek.applyToDefaults(defaults, options || {}));
            await server.register(Inert);
            return server;
        };

        it('returns a file in the response with the correct headers', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file('package.json', { confine: '../' }).code(499);
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(499);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.not.exist();
        });

        it('returns a file using route relativeTo', async () => {

            const server = await provisionServer();
            const handler = (request, h) => {

                return h.file('../package.json', { confine: false });
            };

            server.route({ method: 'GET', path: '/file', handler, config: { files: { relativeTo: __dirname } } });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');

        });

        it('returns a file in the response with the correct headers using cwd relative paths without content-disposition header', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: './package.json' } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.not.exist();
        });

        it('returns a file in the response with the inline content-disposition header when using route config', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: './' } } });
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'inline' } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('inline; filename=package.json');
        });

        it('returns a file in the response with the inline content-disposition header when using route config and overriding filename', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: './' } } });
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'inline', filename: 'attachment.json' } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('inline; filename=attachment.json');
        });

        it('returns a file in the response with the attachment content-disposition header when using route config', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'attachment' } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('attachment; filename=package.json');
        });

        it('returns a file in the response with the attachment content-disposition header when using route config and overriding filename', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'attachment', filename: 'attachment.json' } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('attachment; filename=attachment.json');
        });

        it('returns a file in the response without the content-disposition header when using route config mode false', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: false } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.not.exist();
        });

        it('returns a file with correct headers when using attachment mode', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'attachment' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('attachment; filename=package.json');
        });

        it('returns a file with correct headers when using attachment mode and overriding the filename', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'attachment', filename: 'attachment.json' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('attachment; filename=attachment.json');
        });

        it('returns a file with correct headers when using inline mode', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'inline' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('inline; filename=package.json');
        });

        it('returns a file with correct headers when using inline mode and overriding filename', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'inline', filename: 'attachment.json' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
            expect(res.headers['content-disposition']).to.equal('inline; filename=attachment.json');
        });

        it('returns a partial file with the start option', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join('file', 'note.txt'), { start: 2 });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.equal('st');
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.headers['content-length']).to.equal(2);
        });

        it('returns a partial file with the start and end option', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join('file', 'note.txt'), { start: 1, end: 2 });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.equal('es');
            expect(res.headers['content-type']).to.equal('text/plain; charset=utf-8');
            expect(res.headers['content-length']).to.equal(2);
        });

        it('returns a 404 when the file is not found', async () => {

            const basePath = Path.join(process.platform === 'win32' ? 'C://' : '/', 'no/such/path/x1');
            const server = await provisionServer({ routes: { files: { relativeTo: basePath } } });

            server.route({ method: 'GET', path: '/filenotfound', handler: { file: 'nopes' } });

            const res = await server.inject('/filenotfound');
            expect(res.statusCode).to.equal(404);
            expect(res.request.response._error.data.path).to.equal(Path.join(basePath, 'nopes'));
        });

        it('returns a 403 when the file is a directory', async () => {

            const server = await provisionServer();

            server.route({ method: 'GET', path: '/filefolder', handler: { file: 'lib' } });

            const res = await server.inject('/filefolder');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, '..', 'lib'));
        });

        it('returns a file using the built-in handler config', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/staticfile', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res = await server.inject('/staticfile');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
        });

        it('returns a file using the file function with the built-in handler config', async () => {

            const filenameFn = (request) => {

                return './lib/' + request.params.file;
            };

            const server = await provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/filefn/{file}', handler: { file: filenameFn } });

            const res = await server.inject('/filefn/index.js');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('Set correct confine value');
            expect(res.headers['content-type']).to.equal('application/javascript; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
        });

        it('returns a file in the response with the correct headers (relative path)', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: '.' } } });
            const relativeHandler = (request, h) => {

                return h.file('./package.json', { confine: true });
            };

            server.route({ method: 'GET', path: '/relativefile', handler: relativeHandler });

            const res = await server.inject('/relativefile');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
        });

        it('returns a file using the built-in handler config (relative path)', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/relativestaticfile', handler: { file: './package.json' } });

            const res = await server.inject('/relativestaticfile');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-length']).to.exist();
        });

        it('returns a file with default mime type', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: Path.join(__dirname, 'file', 'FILE') } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('application/octet-stream');
        });

        it('returns a file in the response with the correct headers using custom mime type', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file('../LICENSE.md', { confine: false }).type('application/example');
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('application/example');
        });

        it('handles multiple simultaneous requests', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const first = server.inject('/file');
            const second = server.inject('/file');

            const res1 = await first;
            expect(res1.statusCode).to.equal(200);
            expect(res1.headers).to.include('etag');
            expect(res1.headers).to.include('last-modified');

            const res2 = await second;
            expect(res2.statusCode).to.equal(200);
            expect(res2.headers).to.include('etag');
            expect(res2.headers).to.include('last-modified');
        });

        it('does not cache etags', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } }, 0);
            server.route({ method: 'GET', path: '/note', handler: { file: './file/note.txt' } });

            const res1 = await server.inject('/note');
            expect(res1.statusCode).to.equal(200);
            expect(res1.result).to.equal('Test');
            expect(res1.headers.etag).to.not.exist();

            const res2 = await server.inject('/note');
            expect(res2.statusCode).to.equal(200);
            expect(res2.result).to.equal('Test');
            expect(res2.headers.etag).to.not.exist();
        });

        it('does not return etag when etagMethod is false', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } }, 0);
            server.route({ method: 'GET', path: '/note', handler: { file: { path: './file/note.txt', etagMethod: false } } });

            const res1 = await server.inject('/note');
            expect(res1.statusCode).to.equal(200);
            expect(res1.result).to.equal('Test');
            expect(res1.headers.etag).to.not.exist();

            const res2 = await server.inject('/note');
            expect(res2.statusCode).to.equal(200);
            expect(res2.result).to.equal('Test');
            expect(res2.headers.etag).to.not.exist();
        });

        it('invalidates etags when file changes (simple)', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });

            server.route({ method: 'GET', path: '/note', handler: { file: { path: './file/note.txt', etagMethod: 'simple' } } });

            // No etag, never requested

            const res1 = await server.inject('/note');
            expect(res1.statusCode).to.equal(200);
            expect(res1.result).to.equal('Test');
            expect(res1.headers.etag).to.exist();

            const etag1 = res1.headers.etag;
            expect(etag1.slice(0, 1)).to.equal('"');
            expect(etag1.slice(-1)).to.equal('"');

            // etag

            const res2 = await server.inject({ url: '/note', headers: { 'if-none-match': etag1 } });
            expect(res2.statusCode).to.equal(304);
            expect(res2.headers).to.not.include('content-length');
            expect(res2.headers).to.include('etag');
            expect(res2.headers).to.include('last-modified');

            const fd1 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd1, Buffer.from('Test'), 0, 4);
            Fs.closeSync(fd1);

            // etag after file modified, content unchanged

            const res3 = await server.inject({ url: '/note', headers: { 'if-none-match': etag1 } });
            expect(res3.statusCode).to.equal(200);
            expect(res3.result).to.equal('Test');
            expect(res3.headers.etag).to.exist();

            const etag2 = res3.headers.etag;
            expect(etag1).to.not.equal(etag2);

            const fd2 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd2, Buffer.from('Test1'), 0, 5);
            Fs.closeSync(fd2);

            // etag after file modified, content changed

            const res4 = await server.inject({ url: '/note', headers: { 'if-none-match': etag2 } });

            expect(res4.statusCode).to.equal(200);
            expect(res4.result).to.equal('Test1');
            expect(res4.headers.etag).to.exist();

            const etag3 = res4.headers.etag;
            expect(etag1).to.not.equal(etag3);
            expect(etag2).to.not.equal(etag3);

            const fd3 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd3, Buffer.from('Test'), 0, 4);
            Fs.closeSync(fd3);
        });

        it('invalidates etags when file changes (hash)', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });

            server.route({ method: 'GET', path: '/note', handler: { file: './file/note.txt' } });

            // etag, never requested

            const res1 = await server.inject('/note');
            expect(res1.statusCode).to.equal(200);
            expect(res1.result).to.equal('Test');
            expect(res1.headers.etag).to.exist();

            const etag1 = res1.headers.etag;
            expect(etag1.slice(0, 1)).to.equal('"');
            expect(etag1.slice(-1)).to.equal('"');

            // etag

            const res2 = await server.inject({ url: '/note', headers: { 'if-none-match': etag1 } });
            expect(res2.statusCode).to.equal(304);
            expect(res2.headers).to.not.include('content-length');
            expect(res2.headers).to.include('etag');
            expect(res2.headers).to.include('last-modified');

            Fs.unlinkSync(Path.join(__dirname, 'file', 'note.txt'));
            const fd1 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd1, Buffer.from('Test'), 0, 4);
            Fs.closeSync(fd1);

            // etag after file modified, content unchanged

            const res3 = await server.inject('/note');
            expect(res3.statusCode).to.equal(200);
            expect(res3.result).to.equal('Test');
            expect(res3.headers.etag).to.exist();

            const etag2 = res3.headers.etag;
            expect(etag1).to.equal(etag2);

            const fd2 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd2, Buffer.from('Test1'), 0, 5);
            Fs.closeSync(fd2);

            // etag after file modified, content changed

            const res4 = await server.inject({ url: '/note', headers: { 'if-none-match': etag2 } });
            expect(res4.statusCode).to.equal(200);
            expect(res4.result).to.equal('Test1');
            expect(res4.headers.etag).to.exist();

            const etag3 = res4.headers.etag;
            expect(etag1).to.not.equal(etag3);

            const fd3 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
            Fs.writeSync(fd3, Buffer.from('Test'), 0, 4);
            Fs.closeSync(fd3);

            // etag, content restored

            const res5 = await server.inject('/note');
            expect(res5.statusCode).to.equal(200);
            expect(res5.result).to.equal('Test');
            expect(res5.headers.etag).to.exist();

            const etag4 = res5.headers.etag;
            expect(etag1).to.equal(etag4);
        });

        it('returns a 304 when the request has if-modified-since and the response has not been modified since (larger)', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res1 = await server.inject('/file');
            const last = new Date(Date.parse(res1.headers['last-modified']) + 1000);

            const res2 = await server.inject({ url: '/file', headers: { 'if-modified-since': last.toUTCString() } });
            expect(res2.statusCode).to.equal(304);
            expect(res2.headers).to.not.include('content-length');
            expect(res2.headers).to.include('etag');
            expect(res2.headers).to.include('last-modified');
        });

        it('returns a 304 when the request has if-modified-since and the response has not been modified since (equal)', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res1 = await server.inject('/file');
            const res2 = await server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers['last-modified'] } });
            expect(res2.statusCode).to.equal(304);
            expect(res2.headers).to.not.include('content-length');
            expect(res2.headers).to.include('etag');
            expect(res2.headers).to.include('last-modified');
        });

        it('computes etag header for 304 response', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const future = new Date(Date.now() + 1000);
            const res = await server.inject({ url: '/file', headers: { 'if-modified-since': future } });
            expect(res.statusCode).to.equal(304);
            expect(res.headers).to.include('etag');
            expect(res.headers).to.include('last-modified');
        });

        it('computes etag header for head response', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res = await server.inject({ method: 'HEAD', url: '/file' });
            expect(res.statusCode).to.equal(200);
            expect(res.headers).to.include('etag');
            expect(res.headers).to.include('last-modified');
        });

        it('changes etag when content encoding is used', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res1 = await server.inject('/file');

            expect(res1.statusCode).to.equal(200);
            expect(res1.headers).to.include('etag');
            expect(res1.headers).to.include('last-modified');

            const res2 = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res2.statusCode).to.equal(200);
            expect(res2.headers.vary).to.equal('accept-encoding');
            expect(res2.headers.etag).to.not.equal(res1.headers.etag);
            expect(res2.headers.etag).to.contain(res1.headers.etag.slice(0, -1) + '-');
            expect(res2.headers['last-modified']).to.equal(res2.headers['last-modified']);
        });

        it('return a 500 on hashing errors', async () => {

            const server = await provisionServer();
            const filepath = Path.join(__dirname, '..', 'package.json');
            server.route({ method: 'GET', path: '/file', handler: { file: filepath } });

            // Prepare complicated mocking setup to fake an io error

            const orig = InertFs.createReadStream;
            InertFs.createReadStream = function (path, options) {

                InertFs.createReadStream = orig;

                process.nextTick(() => {

                    Fs.closeSync(options.fd);
                });

                return InertFs.createReadStream(path, options);
            };

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error(/^Failed to hash file/);
            expect(res.request.response._error.data.path).to.equal(filepath);
        });

        it('handles multiple simultaneous request hashing errors', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            // Prepare complicated mocking setup to fake an io error

            const orig = InertFs.createReadStream;
            InertFs.createReadStream = function (path, options) {

                InertFs.createReadStream = orig;

                process.nextTick(() => {

                    Fs.closeSync(options.fd);
                });

                return InertFs.createReadStream(path, options);
            };

            const first = server.inject('/file');
            const second = server.inject('/file');

            await new Promise((resolve) => setImmediate(resolve));

            const res1 = await first;
            expect(res1.statusCode).to.equal(500);
            expect(res1.request.response._error).to.be.an.error(/^Failed to hash file/);
            const res2 = await second;
            expect(res2.statusCode).to.equal(500);
            expect(res2.request.response._error).to.be.an.error(/^Failed to hash file/);
        });

        it('returns valid http date responses in last-modified header', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.headers['last-modified']).to.equal(Fs.statSync(Path.join(__dirname, '..', 'package.json')).mtime.toUTCString());
        });

        it('returns 200 if if-modified-since is invalid', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res = await server.inject({ url: '/file', headers: { 'if-modified-since': 'some crap' } });
            expect(res.statusCode).to.equal(200);
        });

        it('returns 200 if last-modified is invalid', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET',
                path: '/',
                handler: (request, h) => {

                    return h.response('ok').header('last-modified', 'some crap');
                }
            });

            const res = await server.inject({ url: '/', headers: { 'if-modified-since': 'Fri, 28 Mar 2014 22:52:39 GMT' } });
            expect(res.statusCode).to.equal(200);
        });

        it('closes file handlers when not reading file stream', { skip: process.platform === 'win32' }, async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res1 = await server.inject('/file');
            const res2 = await server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date } });
            expect(res2.statusCode).to.equal(304);

            await new Promise((resolve) => {

                const cmd = ChildProcess.spawn('lsof', ['-p', process.pid]);
                let lsof = '';
                cmd.stdout.on('data', (buffer) => {

                    lsof += buffer.toString();
                });

                cmd.stdout.on('end', () => {

                    let count = 0;
                    const lines = lsof.split('\n');
                    for (let i = 0; i < lines.length; ++i) {
                        count += !!lines[i].match(/package.json/);
                    }

                    expect(count).to.equal(0);
                    resolve();
                });

                cmd.stdin.end();
            });
        });

        it('closes file handlers when not using a manually open file stream', { skip: process.platform === 'win32' }, async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET',
                path: '/file',
                handler: (request, h) => {

                    return h.response(Fs.createReadStream(Path.join(__dirname, '..', 'package.json'))).header('etag', 'abc');
                }
            });

            const res1 = await server.inject('/file');
            const res2 = await server.inject({ url: '/file', headers: { 'if-none-match': res1.headers.etag } });
            expect(res2.statusCode).to.equal(304);

            await new Promise((resolve) => {

                const cmd = ChildProcess.spawn('lsof', ['-p', process.pid]);
                let lsof = '';
                cmd.stdout.on('data', (buffer) => {

                    lsof += buffer.toString();
                });

                cmd.stdout.on('end', () => {

                    let count = 0;
                    const lines = lsof.split('\n');
                    for (let i = 0; i < lines.length; ++i) {
                        count += !!lines[i].match(/package.json/);
                    }

                    expect(count).to.equal(0);
                    resolve();
                });

                cmd.stdin.end();
            });
        });

        it('returns a gzipped file in the response when the request accepts gzip', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-encoding']).to.equal('gzip');
            expect(res.headers['content-length']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('returns a plain file when not compressible', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, 'file', 'image.png'));
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.not.exist();
            expect(res.headers['content-length']).to.equal(42010);
            expect(res.payload).to.exist();
        });

        it('returns a deflated file in the response when the request accepts deflate', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, h) => {

                return h.file(Path.join(__dirname, '..', 'package.json'), { confine: '..' });
            };

            server.route({ method: 'GET', path: '/file', handler });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'deflate' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
            expect(res.headers['content-encoding']).to.equal('deflate');
            expect(res.headers['content-length']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('returns a gzipped file using precompressed file', async () => {

            const content = Fs.readFileSync('./test/file/image.png.gz');

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.equal('gzip');
            expect(res.headers['content-length']).to.equal(content.length);
            expect(res.rawPayload.length).to.equal(content.length);
        });

        it('returns a gzipped file using precompressed file using lookupMap', async () => {

            const content = Fs.readFileSync('./test/file/image.jpg#gz');
            const lookupMap = { gzip: '#gz' };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.jpg', lookupCompressed: true, lookupMap } } });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/jpeg');
            expect(res.headers['content-encoding']).to.equal('gzip');
            expect(res.headers['content-length']).to.equal(content.length);
            expect(res.rawPayload.length).to.equal(content.length);
        });

        it('returns a gzipped file when precompressed file not found', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/note.txt', lookupCompressed: true } } });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-encoding']).to.equal('gzip');
            expect(res.headers['content-length']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('returns a 304 when using precompressed file and if-modified-since set', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            const res1 = await server.inject('/file');
            const res2 = await server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date, 'accept-encoding': 'gzip' } });
            expect(res2.statusCode).to.equal(304);
        });

        it('ignores precompressed file when content-encoding not requested', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            const res = await server.inject('/file');
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('ignores precompressed file when connection compression is disabled', async () => {

            const server = await provisionServer({ compression: false });
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('ignores precompressed file when using start option', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET', path: '/file', handler: {
                    file: {
                        path: './test/file/image.png',
                        lookupCompressed: true,
                        start: 5
                    }
                }
            });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('ignores precompressed file when using start option', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET', path: '/file', handler: {
                    file: {
                        path: './test/file/image.png',
                        lookupCompressed: true,
                        end: 199
                    }
                }
            });

            const res = await server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } });
            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(200);
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.not.exist();
            expect(res.payload).to.exist();
        });

        it('does not throw an error when adding a route with a parameter and function path', async () => {

            const server = await provisionServer();

            const fn = () => {

                server.route({ method: 'GET', path: '/fileparam/{path}', handler: { file: () => { } } });
                server.route({ method: 'GET', path: '/filepathparam/{path}', handler: { file: { path: () => { } } } });
            };

            expect(fn).to.not.throw();
        });

        it('responds correctly when file is removed while processing', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });
            server.ext('onPreResponse', (request, h) => {

                Fs.unlinkSync(filename);
                return h.continue;
            });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
        });

        it('responds correctly when file is changed while processing', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });
            server.ext('onPreResponse', (request, h) => {

                const tempfile = filename + '~';
                if (process.platform === 'win32') {
                    // workaround to replace open file without a permission error
                    Fs.renameSync(filename, tempfile);
                    Fs.writeFileSync(filename, 'database');
                    Fs.unlinkSync(tempfile);
                }
                else {
                    // atomic file replace
                    Fs.writeFileSync(tempfile, 'database');
                    Fs.renameSync(tempfile, filename);
                }

                return h.continue;
            });

            const res = await server.inject('/');

            Fs.unlinkSync(filename);

            expect(res.statusCode).to.equal(200);
            expect(res.headers['content-length']).to.equal(4);
            expect(res.payload).to.equal('data');
        });

        it('does not marshal response on 304', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const res1 = await server.inject('/file');

            server.ext('onPreResponse', (request, h) => {

                request.response._marshall = () => {

                    throw new Error('not called');
                };

                return h.continue;
            });

            const res = await server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date } });
            expect(res.statusCode).to.equal(304);
        });

        it('returns error when aborted while processing', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });
            server.ext('onPreResponse', (request, h) => {

                throw Boom.internal('crapping out');
            });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('crapping out');
        });

        it('returns error when stat fails unexpectedly', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const orig = InertFs.fstat;
            InertFs.fstat = function (fd) {        // can return EIO error

                InertFs.fstat = orig;
                throw new Error('failed');
            };


            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('Failed to stat file: failed');
            expect(res.request.response._error.data.path).to.equal(filename);
        });

        it('returns error when open fails unexpectedly', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const orig = InertFs.open;
            InertFs.open = function () {        // can return EMFILE error

                InertFs.open = orig;
                throw new Error('failed');
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('Failed to open file: failed');
            expect(res.request.response._error.data.path).to.equal(filename);
        });

        it('returns a 403 when missing file read permission', async () => {

            const filename = File.uniqueFilename(Os.tmpdir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            let retainedFd;
            if (process.platform === 'win32') {
                // make a permissionless file by unlinking an open file
                retainedFd = Fs.openSync(filename, 'r');
                Fs.unlinkSync(filename);
            }
            else {
                Fs.chmodSync(filename, 0);
            }

            const server = await provisionServer();

            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });

            let didOpen = false;
            const res1 = await server.inject('/');

            const orig = InertFs.open;
            InertFs.open = async function (path, mode) {        // fake alternate permission error

                InertFs.open = orig;
                didOpen = true;

                try {
                    return await InertFs.open(path, mode);
                }
                catch (err) {
                    if (err.code === 'EACCES') {
                        err.code = 'EPERM';
                        err.errno = -1;
                    }
                    else if (err.code === 'EPERM') {
                        err.code = 'EACCES';
                        err.errno = -13;
                    }

                    throw err;
                }
            };

            const res2 = await server.inject('/');

            // cleanup
            if (typeof retainedFd === 'number') {
                Fs.closeSync(retainedFd);
            }
            else {
                Fs.unlinkSync(filename);
            }

            expect(res1.statusCode).to.equal(403);
            expect(res2.statusCode).to.equal(403);
            expect(didOpen).to.equal(true);
        });

        describe('response range', () => {

            it('returns a subset of a file (start)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=0-4' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(5);
                expect(res.headers['content-range']).to.equal('bytes 0-4/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('\x89PNG\r', 'ascii'));
            });

            it('returns a subset of a file (middle)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(5);
                expect(res.headers['content-range']).to.equal('bytes 1-5/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('PNG\r\n', 'ascii'));
            });

            it('returns a subset of a file (-to)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=-5' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(5);
                expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('D\xAEB\x60\x82', 'ascii'));
            });

            it('returns a subset of a file (from-)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=42005-' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(5);
                expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('D\xAEB\x60\x82', 'ascii'));
            });

            it('returns a subset of a file (beyond end)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(5);
                expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('D\xAEB\x60\x82', 'ascii'));
            });

            it('returns a subset of a file (if-range)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res1 = await server.inject('/file');
                const res2 = await server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011', 'if-range': res1.headers.etag } });
                expect(res2.statusCode).to.equal(206);
                expect(res2.headers['content-length']).to.equal(5);
                expect(res2.headers['content-range']).to.equal('bytes 42005-42009/42010');
                expect(res2.headers['accept-ranges']).to.equal('bytes');
                expect(res2.rawPayload).to.equal(Buffer.from('D\xAEB\x60\x82', 'ascii'));
            });

            it('returns 200 on incorrect if-range', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011', 'if-range': 'abc' } });
                expect(res.statusCode).to.equal(200);
            });

            it('returns 416 on invalid range (unit)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'horses=1-5' } });
                expect(res.statusCode).to.equal(416);
                expect(res.headers['content-range']).to.equal('bytes */42010');
            });

            it('returns 416 on invalid range (inversed)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=5-1' } });
                expect(res.statusCode).to.equal(416);
                expect(res.headers['content-range']).to.equal('bytes */42010');
            });

            it('returns 416 on invalid range (format)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes 1-5' } });
                expect(res.statusCode).to.equal(416);
                expect(res.headers['content-range']).to.equal('bytes */42010');
            });

            it('returns 416 on invalid range (empty range)', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=-' } });
                expect(res.statusCode).to.equal(416);
                expect(res.headers['content-range']).to.equal('bytes */42010');
            });

            it('returns 200 on multiple ranges', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-5,7-10' } });
                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(42010);
            });

            it('reads partial file content for a non-compressible file', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png'), etagMethod: false } } });

                // Catch createReadStream options

                let createOptions;
                const orig = InertFs.createReadStream;
                InertFs.createReadStream = function (path, options) {

                    InertFs.createReadStream = orig;
                    createOptions = options;

                    return InertFs.createReadStream(path, options);
                };

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-4', 'accept-encoding': 'gzip' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(4);
                expect(res.headers['content-range']).to.equal('bytes 1-4/42010');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('PNG\r', 'ascii'));
                expect(createOptions).to.include({ start: 1, end: 4 });
            });

            it('returns 200 when content-length is missing', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.ext('onPreResponse', (request, h) => {

                    delete request.response.headers['content-length'];
                    return h.continue;
                });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } });
                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.not.exist();
            });

            it('returns 200 for dynamically compressed responses', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'gzip' } });
                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.not.exist();
                expect(res.headers['content-range']).to.not.exist();
                expect(res.headers['accept-ranges']).to.equal('bytes');
            });

            it('returns a subset of a file when compression is disabled', async () => {

                const server = await provisionServer({ compression: false });
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'gzip' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.headers['content-length']).to.equal(3);
                expect(res.headers['content-range']).to.equal('bytes 1-3/4');
            });

            it('returns a subset of a file using precompressed file', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png'), lookupCompressed: true } } });
                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=10-18', 'accept-encoding': 'gzip' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.equal(9);
                expect(res.headers['content-range']).to.equal('bytes 10-18/41936');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.payload).to.equal('image.png');
            });

            it('returns a subset for dynamically compressed responses with "identity" encoding', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'identity' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.headers['content-length']).to.equal(3);
                expect(res.headers['content-range']).to.equal('bytes 1-3/4');
            });

            it('returns a subset when content-type is missing', async () => {

                const server = await provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt') } } });

                server.ext('onPreResponse', (request, h) => {

                    delete request.response.headers['content-type'];
                    return h.continue;
                });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.headers['content-length']).to.equal(3);
                expect(res.headers['content-range']).to.equal('bytes 1-3/4');
                expect(res.headers['content-type']).to.not.exist();
            });

            it('ignores range request when disabled in route config', async () => {

                const server = await provisionServer();
                server.route({
                    method: 'GET', path: '/file',
                    handler: { file: { path: Path.join(__dirname, 'file/image.png') } },
                    config: { response: { ranges: false } }
                });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=0-4' } });
                expect(res.statusCode).to.equal(200);
                expect(res.headers['accept-ranges']).to.not.exist();
            });

            it('returns a subset of a file with start option', async () => {

                const server = await provisionServer();
                server.route({
                    method: 'GET', path: '/file', handler: {
                        file: {
                            path: Path.join(__dirname, 'file/image.png'),
                            start: 1
                        }
                    }
                });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=2-3' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(2);
                expect(res.headers['content-range']).to.equal('bytes 2-3/42009');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('G\r', 'ascii'));
            });

            it('returns a subset of a file with start and end option', async () => {

                const server = await provisionServer();
                server.route({
                    method: 'GET', path: '/file', handler: {
                        file: {
                            path: Path.join(__dirname, 'file/image.png'),
                            start: 2,
                            end: 400
                        }
                    }
                });

                const res = await server.inject({ url: '/file', headers: { 'range': 'bytes=0-2' } });
                expect(res.statusCode).to.equal(206);
                expect(res.headers['content-length']).to.equal(3);
                expect(res.headers['content-range']).to.equal('bytes 0-2/399');
                expect(res.headers['accept-ranges']).to.equal('bytes');
                expect(res.rawPayload).to.equal(Buffer.from('NG\r', 'ascii'));
            });
        });

        it('has not leaked file descriptors', { skip: process.platform === 'win32' }, async () => {

            // validate that all descriptors has been closed
            const cmd = ChildProcess.spawn('lsof', ['-p', process.pid]);
            let lsof = '';
            cmd.stdout.on('data', (buffer) => {

                lsof += buffer.toString();
            });

            await new Promise((resolve) => {

                cmd.stdout.on('end', () => {

                    let count = 0;
                    const lines = lsof.split('\n');
                    for (let i = 0; i < lines.length; ++i) {
                        count += !!lines[i].match(/package.json/);
                    }

                    expect(count).to.equal(0);
                    resolve();
                });

                cmd.stdin.end();
            });
        });
    });
});
