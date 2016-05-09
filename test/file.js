'use strict';

// Load modules

const ChildProcess = require('child_process');
const Fs = require('fs');
const Os = require('os');
const Path = require('path');
const Boom = require('boom');
const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Items = require('items');
const Inert = require('..');
const Lab = require('lab');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('file', () => {

    describe('handler()', () => {

        const provisionServer = (connection, etagsCacheMaxSize) => {

            const server = new Hapi.Server();
            server.connection(connection || {});
            server.register(etagsCacheMaxSize !== undefined ? { register: Inert, options: { etagsCacheMaxSize: etagsCacheMaxSize } } : Inert, Hoek.ignore);
            return server;
        };

        it('returns a file in the response with the correct headers', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file('package.json', { confine: '../' }).code(499);
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(499);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.not.exist();
                done();
            });
        });

        it('returns a file using route relativeTo', (done) => {

            const server = provisionServer();
            const handler = (request, reply) => {

                reply.file('../package.json', { confine: false });
            };

            server.route({ method: 'GET', path: '/file', handler: handler, config: { files: { relativeTo: __dirname } } });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                done();
            });
        });

        it('returns a file in the response with the correct headers using cwd relative paths without content-disposition header', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: './package.json' } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.not.exist();
                done();
            });
        });

        it('returns a file in the response with the inline content-disposition header when using route config', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: './' } } });
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'inline' } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('inline; filename=package.json');
                done();
            });
        });

        it('returns a file in the response with the inline content-disposition header when using route config and overriding filename', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: './' } } });
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'inline', filename: 'attachment.json' } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('inline; filename=attachment.json');
                done();
            });
        });

        it('returns a file in the response with the attachment content-disposition header when using route config', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'attachment' } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('attachment; filename=package.json');
                done();
            });
        });

        it('returns a file in the response with the attachment content-disposition header when using route config and overriding filename', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: 'attachment', filename: 'attachment.json' } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('attachment; filename=attachment.json');
                done();
            });
        });

        it('returns a file in the response without the content-disposition header when using route config mode false', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: './package.json', mode: false } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.not.exist();
                done();
            });
        });

        it('returns a file with correct headers when using attachment mode', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'attachment' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('attachment; filename=package.json');
                done();
            });
        });

        it('returns a file with correct headers when using attachment mode and overriding the filename', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'attachment', filename: 'attachment.json' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('attachment; filename=attachment.json');
                done();
            });
        });

        it('returns a file with correct headers when using inline mode', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'inline' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('inline; filename=package.json');
                done();
            });
        });

        it('returns a file with correct headers when using inline mode and overriding filename', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..', mode: 'inline', filename: 'attachment.json' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                expect(res.headers['content-disposition']).to.equal('inline; filename=attachment.json');
                done();
            });
        });

        it('returns a 404 when the file is not found', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: '/no/such/path/x1' } } });

            server.route({ method: 'GET', path: '/filenotfound', handler: { file: 'nopes' } });

            server.inject('/filenotfound', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a 403 when the file is a directory', (done) => {

            const server = provisionServer();

            server.route({ method: 'GET', path: '/filefolder', handler: { file: 'lib' } });

            server.inject('/filefolder', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a file using the built-in handler config', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/staticfile', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/staticfile', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                done();
            });
        });

        it('returns a file using the file function with the built-in handler config', (done) => {

            const filenameFn = (request) => {

                return './lib/' + request.params.file;
            };

            const server = provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/filefn/{file}', handler: { file: filenameFn } });

            server.inject('/filefn/index.js', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('// Load modules');
                expect(res.headers['content-type']).to.equal('application/javascript; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                done();
            });
        });

        it('returns a file in the response with the correct headers (relative path)', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: '.' } } });
            const relativeHandler = (request, reply) => {

                reply.file('./package.json', { confine: true });
            };

            server.route({ method: 'GET', path: '/relativefile', handler: relativeHandler });

            server.inject('/relativefile', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                done();
            });
        });

        it('returns a file using the built-in handler config (relative path)', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: Path.join(__dirname, '..') } } });
            server.route({ method: 'GET', path: '/relativestaticfile', handler: { file: './package.json' } });

            server.inject('/relativestaticfile', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-length']).to.exist();
                done();
            });
        });

        it('returns a file with default mime type', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: Path.join(__dirname, '..', 'LICENSE') } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('application/octet-stream');
                done();
            });
        });

        it('returns a file in the response with the correct headers using custom mime type', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file('../LICENSE', { confine: false }).type('application/example');
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('application/example');
                done();
            });
        });

        it('handles multiple simultaneous requests', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            Items.parallel(['/file', '/file'], (req, next) => {

                server.inject(req, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.headers).to.include('etag');
                    expect(res.headers).to.include('last-modified');
                    next();
                });
            }, done);
        });

        it('does not cache etags', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } }, 0);
            server.route({ method: 'GET', path: '/note', handler: { file: './file/note.txt' } });

            server.inject('/note', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('Test');
                expect(res.headers.etag).to.not.exist();

                server.inject('/note', (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    expect(res2.result).to.equal('Test');
                    expect(res2.headers.etag).to.not.exist();
                    done();
                });
            });
        });

        it('does not return etag when etagMethod is false', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } }, 0);
            server.route({ method: 'GET', path: '/note', handler: { file: { path: './file/note.txt', etagMethod: false } } });

            server.inject('/note', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('Test');
                expect(res.headers.etag).to.not.exist();

                server.inject('/note', (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    expect(res2.result).to.equal('Test');
                    expect(res2.headers.etag).to.not.exist();
                    done();
                });
            });
        });

        it('invalidates etags when file changes (simple)', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });

            server.route({ method: 'GET', path: '/note', handler: { file: { path: './file/note.txt', etagMethod: 'simple' } } });

            // No etag, never requested

            server.inject('/note', (res1) => {

                expect(res1.statusCode).to.equal(200);
                expect(res1.result).to.equal('Test');
                expect(res1.headers.etag).to.exist();

                const etag1 = res1.headers.etag;

                expect(etag1.slice(0, 1)).to.equal('"');
                expect(etag1.slice(-1)).to.equal('"');

                // etag

                server.inject({ url: '/note', headers: { 'if-none-match': etag1 } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    expect(res2.headers).to.not.include('content-length');
                    expect(res2.headers).to.include('etag');
                    expect(res2.headers).to.include('last-modified');

                    const fd1 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                    Fs.writeSync(fd1, new Buffer('Test'), 0, 4);
                    Fs.closeSync(fd1);

                    // etag after file modified, content unchanged

                    server.inject({ url: '/note', headers: { 'if-none-match': etag1 } }, (res3) => {

                        expect(res3.statusCode).to.equal(200);
                        expect(res3.result).to.equal('Test');
                        expect(res3.headers.etag).to.exist();

                        const etag2 = res3.headers.etag;
                        expect(etag1).to.not.equal(etag2);

                        const fd2 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                        Fs.writeSync(fd2, new Buffer('Test1'), 0, 5);
                        Fs.closeSync(fd2);

                        // etag after file modified, content changed

                        server.inject({ url: '/note', headers: { 'if-none-match': etag2 } }, (res4) => {

                            expect(res4.statusCode).to.equal(200);
                            expect(res4.result).to.equal('Test1');
                            expect(res4.headers.etag).to.exist();

                            const etag3 = res4.headers.etag;
                            expect(etag1).to.not.equal(etag3);
                            expect(etag2).to.not.equal(etag3);

                            const fd3 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                            Fs.writeSync(fd3, new Buffer('Test'), 0, 4);
                            Fs.closeSync(fd3);

                            done();
                        });
                    });
                });
            });
        });

        it('invalidates etags when file changes (hash)', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });

            server.route({ method: 'GET', path: '/note', handler: { file: './file/note.txt' } });

            // etag, never requested

            server.inject('/note', (res1) => {

                expect(res1.statusCode).to.equal(200);
                expect(res1.result).to.equal('Test');
                expect(res1.headers.etag).to.exist();

                const etag1 = res1.headers.etag;

                expect(etag1.slice(0, 1)).to.equal('"');
                expect(etag1.slice(-1)).to.equal('"');

                // etag

                server.inject({ url: '/note', headers: { 'if-none-match': etag1 } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    expect(res2.headers).to.not.include('content-length');
                    expect(res2.headers).to.include('etag');
                    expect(res2.headers).to.include('last-modified');

                    Fs.unlinkSync(Path.join(__dirname, 'file', 'note.txt'));
                    const fd1 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                    Fs.writeSync(fd1, new Buffer('Test'), 0, 4);
                    Fs.closeSync(fd1);

                    // etag after file modified, content unchanged

                    server.inject('/note', (res3) => {

                        expect(res3.statusCode).to.equal(200);
                        expect(res3.result).to.equal('Test');
                        expect(res3.headers.etag).to.exist();

                        const etag2 = res3.headers.etag;
                        expect(etag1).to.equal(etag2);

                        const fd2 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                        Fs.writeSync(fd2, new Buffer('Test1'), 0, 5);
                        Fs.closeSync(fd2);

                        // etag after file modified, content changed

                        server.inject({ url: '/note', headers: { 'if-none-match': etag2 } }, (res4) => {

                            expect(res4.statusCode).to.equal(200);
                            expect(res4.result).to.equal('Test1');
                            expect(res4.headers.etag).to.exist();

                            const etag3 = res4.headers.etag;
                            expect(etag1).to.not.equal(etag3);

                            const fd3 = Fs.openSync(Path.join(__dirname, 'file', 'note.txt'), 'w');
                            Fs.writeSync(fd3, new Buffer('Test'), 0, 4);
                            Fs.closeSync(fd3);

                            // etag, content restored

                            server.inject('/note', (res5) => {

                                expect(res5.statusCode).to.equal(200);
                                expect(res5.result).to.equal('Test');
                                expect(res5.headers.etag).to.exist();

                                const etag4 = res5.headers.etag;
                                expect(etag1).to.equal(etag4);

                                done();
                            });
                        });
                    });
                });
            });
        });

        it('returns a 304 when the request has if-modified-since and the response has not been modified since (larger)', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res1) => {

                const last = new Date(Date.parse(res1.headers['last-modified']) + 1000);
                server.inject({ url: '/file', headers: { 'if-modified-since': last.toUTCString() } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    expect(res2.headers).to.not.include('content-length');
                    expect(res2.headers).to.include('etag');
                    expect(res2.headers).to.include('last-modified');
                    done();
                });
            });
        });

        it('returns a 304 when the request has if-modified-since and the response has not been modified since (equal)', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res1) => {

                server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers['last-modified'] } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    expect(res2.headers).to.not.include('content-length');
                    expect(res2.headers).to.include('etag');
                    expect(res2.headers).to.include('last-modified');
                    done();
                });
            });
        });

        it('computes etag header for 304 response', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            const future = new Date(Date.now() + 1000);
            server.inject({ url: '/file', headers: { 'if-modified-since': future } }, (res) => {

                expect(res.statusCode).to.equal(304);
                expect(res.headers).to.include('etag');
                expect(res.headers).to.include('last-modified');
                done();
            });
        });

        it('computes etag header for head response', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject({ method: 'HEAD', url: '/file' }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers).to.include('etag');
                expect(res.headers).to.include('last-modified');
                done();
            });
        });

        it('changes etag when content encoding is used', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res1) => {

                expect(res1.statusCode).to.equal(200);
                expect(res1.headers).to.include('etag');
                expect(res1.headers).to.include('last-modified');

                server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    expect(res2.headers.vary).to.equal('accept-encoding');
                    expect(res2.headers.etag).to.not.equal(res1.headers.etag);
                    expect(res2.headers.etag).to.contain(res1.headers.etag.slice(0, -1) + '-');
                    expect(res2.headers['last-modified']).to.equal(res2.headers['last-modified']);
                    done();
                });
            });
        });

        it('return a 500 on hashing errors', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            // Prepare complicated mocking setup to fake an io error

            const orig = Fs.createReadStream;
            Fs.createReadStream = function (path, options) {

                Fs.createReadStream = orig;

                process.nextTick(() => {

                    Fs.closeSync(options.fd);
                });

                return Fs.createReadStream(path, options);
            };

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('handles multiple simultaneous request hashing errors', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            // Prepare complicated mocking setup to fake an io error

            const orig = Fs.createReadStream;
            Fs.createReadStream = function (path, options) {

                Fs.createReadStream = orig;

                process.nextTick(() => {

                    Fs.closeSync(options.fd);
                });

                return Fs.createReadStream(path, options);
            };

            Items.parallel(['/file', '/file'], (req, next) => {

                setImmediate(() => {

                    server.inject(req, (res) => {

                        expect(res.statusCode).to.equal(500);
                        next();
                    });
                });
            }, done);
        });

        it('returns valid http date responses in last-modified header', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['last-modified']).to.equal(Fs.statSync(Path.join(__dirname, '..', 'package.json')).mtime.toUTCString());
                done();
            });
        });

        it('returns 200 if if-modified-since is invalid', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject({ url: '/file', headers: { 'if-modified-since': 'some crap' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('returns 200 if last-modified is invalid', (done) => {

            const server = provisionServer();
            server.route({
                method: 'GET',
                path: '/',
                handler: (request, reply) => {

                    reply('ok').header('last-modified', 'some crap');
                }
            });

            server.inject({ url: '/', headers: { 'if-modified-since': 'Fri, 28 Mar 2014 22:52:39 GMT' } }, (res2) => {

                expect(res2.statusCode).to.equal(200);
                done();
            });
        });

        it('closes file handlers when not reading file stream', { skip: process.platform === 'win32' }, (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res1) => {

                server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
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
                        done();
                    });

                    cmd.stdin.end();
                });
            });
        });

        it('closes file handlers when not using a manually open file stream', { skip: process.platform === 'win32' }, (done) => {

            const server = provisionServer();
            server.route({
                method: 'GET',
                path: '/file',
                handler: (request, reply) => {

                    reply(Fs.createReadStream(Path.join(__dirname, '..', 'package.json'))).header('etag', 'abc');
                }
            });

            server.inject('/file', (res1) => {

                server.inject({ url: '/file', headers: { 'if-none-match': res1.headers.etag } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
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
                        done();
                    });

                    cmd.stdin.end();
                });
            });
        });

        it('returns a gzipped file in the response when the request accepts gzip', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.not.exist();
                expect(res.payload).to.exist();
                done();
            });
        });

        it('returns a plain file when not compressible', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, 'file', 'image.png'));
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('image/png');
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.headers['content-length']).to.equal(42010);
                expect(res.payload).to.exist();
                done();
            });
        });

        it('returns a deflated file in the response when the request accepts deflate', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } } });
            const handler = (request, reply) => {

                reply.file(Path.join(__dirname, '..', 'package.json'), { confine: '..' });
            };

            server.route({ method: 'GET', path: '/file', handler: handler });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'deflate' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('application/json; charset=utf-8');
                expect(res.headers['content-encoding']).to.equal('deflate');
                expect(res.headers['content-length']).to.not.exist();
                expect(res.payload).to.exist();
                done();
            });
        });

        it('returns a gzipped file using precompressed file', (done) => {

            const content = Fs.readFileSync('./test/file/image.png.gz');

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('image/png');
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.equal(content.length);
                expect(res.rawPayload.length).to.equal(content.length);
                done();
            });
        });

        it('returns a gzipped file when precompressed file not found', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/note.txt', lookupCompressed: true } } });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-encoding']).to.equal('gzip');
                expect(res.headers['content-length']).to.not.exist();
                expect(res.payload).to.exist();
                done();
            });
        });

        it('returns a 304 when using precompressed file and if-modified-since set', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            server.inject('/file', (res1) => {

                server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date, 'accept-encoding': 'gzip' } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    done();
                });
            });
        });

        it('ignores precompressed file when content-encoding not requested', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            server.inject('/file', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('image/png');
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.payload).to.exist();
                done();
            });
        });

        it('ignores precompressed file when connection compression is disabled', (done) => {

            const server = provisionServer({ compression: false });
            server.route({ method: 'GET', path: '/file', handler: { file: { path: './test/file/image.png', lookupCompressed: true } } });

            server.inject({ url: '/file', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-type']).to.equal('image/png');
                expect(res.headers['content-encoding']).to.not.exist();
                expect(res.payload).to.exist();
                done();
            });
        });

        it('does not throw an error when adding a route with a parameter and function path', (done) => {

            const fn = () => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/fileparam/{path}', handler: { file: () => { } } });
                server.route({ method: 'GET', path: '/filepathparam/{path}', handler: { file: { path: () => { } } } });
            };

            expect(fn).to.not.throw();
            done();
        });

        it('responds correctly when file is removed while processing', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });
            server.ext('onPreResponse', (request, reply) => {

                Fs.unlinkSync(filename);
                return reply.continue();
            });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('responds correctly when file is changed while processing', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });
            server.ext('onPreResponse', (request, reply) => {

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

                return reply.continue();
            });

            server.inject('/', (res) => {

                Fs.unlinkSync(filename);

                expect(res.statusCode).to.equal(200);
                expect(res.headers['content-length']).to.equal(4);
                expect(res.payload).to.equal('data');
                done();
            });
        });

        it('does not marshal response on 304', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/file', handler: { file: Path.join(__dirname, '..', 'package.json') } });

            server.inject('/file', (res1) => {

                server.ext('onPreResponse', (request, reply) => {

                    request.response._marshall = () => {

                        throw new Error('not called');
                    };

                    return reply.continue();
                });

                server.inject({ url: '/file', headers: { 'if-modified-since': res1.headers.date } }, (res2) => {

                    expect(res2.statusCode).to.equal(304);
                    done();
                });
            });
        });

        it('returns error when aborted while processing', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: filename } });
            server.ext('onPreResponse', (request, reply) => {

                reply(Boom.internal('crapping out'));
            });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when stat fails unexpectedly', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const orig = Fs.fstat;
            Fs.fstat = function (fd, callback) {        // can return EIO error

                Fs.fstat = orig;
                callback(new Error('failed'));
            };


            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when open fails unexpectedly', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
            Fs.writeFileSync(filename, 'data');

            const orig = Fs.open;
            Fs.open = function () {        // can return EMFILE error

                Fs.open = orig;
                const callback = arguments[arguments.length - 1];
                callback(new Error('failed'));
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: { path: filename, confine: false } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns a 403 when missing file read permission', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir()) + '.package.json';
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

            const server = provisionServer();
            server.route({ method: 'GET', path: '/', handler: { file: filename } });

            server.inject('/', (res1) => {

                const orig = Fs.open;
                Fs.open = function (path, mode, callback) {        // fake alternate permission error

                    Fs.open = orig;
                    return Fs.open(path, mode, (err, fd) => {

                        if (err) {
                            if (err.code === 'EACCES') {
                                err.code = 'EPERM';
                                err.errno = -1;
                            }
                            else if (err.code === 'EPERM') {
                                err.code = 'EACCES';
                                err.errno = -13;
                            }
                        }

                        return callback(err, fd);
                    });
                };

                server.inject('/', (res2) => {

                    // cleanup
                    if (typeof retainedFd === 'number') {
                        Fs.closeSync(retainedFd);
                    }
                    else {
                        Fs.unlinkSync(filename);
                    }

                    expect(res1.statusCode).to.equal(403);
                    expect(res2.statusCode).to.equal(403);
                    done();
                });
            });
        });

        describe('response range', () => {

            it('returns a subset of a file (start)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=0-4' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(5);
                    expect(res.headers['content-range']).to.equal('bytes 0-4/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('\x89PNG\r', 'ascii'));
                    done();
                });
            });

            it('returns a subset of a file (middle)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(5);
                    expect(res.headers['content-range']).to.equal('bytes 1-5/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('PNG\r\n', 'ascii'));
                    done();
                });
            });

            it('returns a subset of a file (-to)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=-5' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(5);
                    expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('D\xAEB\x60\x82', 'ascii'));
                    done();
                });
            });

            it('returns a subset of a file (from-)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=42005-' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(5);
                    expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('D\xAEB\x60\x82', 'ascii'));
                    done();
                });
            });

            it('returns a subset of a file (beyond end)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(5);
                    expect(res.headers['content-range']).to.equal('bytes 42005-42009/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('D\xAEB\x60\x82', 'ascii'));
                    done();
                });
            });

            it('returns a subset of a file (if-range)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject('/file', (res1) => {

                    server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011', 'if-range': res1.headers.etag } }, (res2) => {

                        expect(res2.statusCode).to.equal(206);
                        expect(res2.headers['content-length']).to.equal(5);
                        expect(res2.headers['content-range']).to.equal('bytes 42005-42009/42010');
                        expect(res2.headers['accept-ranges']).to.equal('bytes');
                        expect(res2.rawPayload).to.deep.equal(new Buffer('D\xAEB\x60\x82', 'ascii'));
                        done();
                    });
                });
            });

            it('returns 200 on incorrect if-range', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=42005-42011', 'if-range': 'abc' } }, (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    done();
                });
            });

            it('returns 416 on invalid range (unit)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'horses=1-5' } }, (res) => {

                    expect(res.statusCode).to.equal(416);
                    expect(res.headers['content-range']).to.equal('bytes */42010');
                    done();
                });
            });

            it('returns 416 on invalid range (inversed)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=5-1' } }, (res) => {

                    expect(res.statusCode).to.equal(416);
                    expect(res.headers['content-range']).to.equal('bytes */42010');
                    done();
                });
            });

            it('returns 416 on invalid range (format)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes 1-5' } }, (res) => {

                    expect(res.statusCode).to.equal(416);
                    expect(res.headers['content-range']).to.equal('bytes */42010');
                    done();
                });
            });

            it('returns 416 on invalid range (empty range)', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=-' } }, (res) => {

                    expect(res.statusCode).to.equal(416);
                    expect(res.headers['content-range']).to.equal('bytes */42010');
                    done();
                });
            });

            it('returns 200 on multiple ranges', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.inject({ url: '/file', headers: { 'range': 'bytes=1-5,7-10' } }, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.headers['content-length']).to.equal(42010);
                    done();
                });
            });

            it('reads partial file content for a non-compressible file', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png'), etagMethod: false } } });

                // Catch createReadStream options

                let createOptions;
                const orig = Fs.createReadStream;
                Fs.createReadStream = function (path, options) {

                    Fs.createReadStream = orig;
                    createOptions = options;

                    return Fs.createReadStream(path, options);
                };

                server.inject({ url: '/file', headers: { 'range': 'bytes=1-4', 'accept-encoding': 'gzip' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-length']).to.equal(4);
                    expect(res.headers['content-range']).to.equal('bytes 1-4/42010');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.rawPayload).to.deep.equal(new Buffer('PNG\r', 'ascii'));
                    expect(createOptions).to.include({ start: 1, end: 4 });
                    done();
                });
            });

            it('returns 200 when content-length is missing', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png') } } });

                server.ext('onPreResponse', (request, reply) => {

                    delete request.response.headers['content-length'];
                    return reply.continue();
                });

                server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } }, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.headers['content-length']).to.not.exist();
                    done();
                });
            });

            it('returns 200 for dynamically compressed responses', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'gzip' } }, (res) => {

                    expect(res.statusCode).to.equal(200);
                    expect(res.headers['content-encoding']).to.equal('gzip');
                    expect(res.headers['content-length']).to.not.exist();
                    expect(res.headers['content-range']).to.not.exist();
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    done();
                });
            });

            it('returns a subset of a file when compression is disabled', (done) => {

                const server = provisionServer({ compression: false });
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'gzip' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-encoding']).to.not.exist();
                    expect(res.headers['content-length']).to.equal(3);
                    expect(res.headers['content-range']).to.equal('bytes 1-3/4');
                    done();
                });
            });

            it('returns a subset of a file using precompressed file', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/image.png'), lookupCompressed: true } } });
                server.inject({ url: '/file', headers: { 'range': 'bytes=10-18', 'accept-encoding': 'gzip' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-encoding']).to.equal('gzip');
                    expect(res.headers['content-length']).to.equal(9);
                    expect(res.headers['content-range']).to.equal('bytes 10-18/41936');
                    expect(res.headers['accept-ranges']).to.equal('bytes');
                    expect(res.payload).to.equal('image.png');
                    done();
                });
            });

            it('returns a subset for dynamically compressed responses with "identity" encoding', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt'), lookupCompressed: false } } });
                server.inject({ url: '/file', headers: { 'range': 'bytes=1-3', 'accept-encoding': 'identity' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-encoding']).to.not.exist();
                    expect(res.headers['content-length']).to.equal(3);
                    expect(res.headers['content-range']).to.equal('bytes 1-3/4');
                    done();
                });
            });

            it('returns a subset when content-type is missing', (done) => {

                const server = provisionServer();
                server.route({ method: 'GET', path: '/file', handler: { file: { path: Path.join(__dirname, 'file/note.txt') } } });

                server.ext('onPreResponse', (request, reply) => {

                    delete request.response.headers['content-type'];
                    return reply.continue();
                });

                server.inject({ url: '/file', headers: { 'range': 'bytes=1-5' } }, (res) => {

                    expect(res.statusCode).to.equal(206);
                    expect(res.headers['content-encoding']).to.not.exist();
                    expect(res.headers['content-length']).to.equal(3);
                    expect(res.headers['content-range']).to.equal('bytes 1-3/4');
                    expect(res.headers['content-type']).to.not.exist();
                    done();
                });
            });
        });

        it('has not leaked file descriptors', { skip: process.platform === 'win32' }, (done) => {

            // validate that all descriptors has been closed
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
                done();
            });

            cmd.stdin.end();
        });
    });
});
