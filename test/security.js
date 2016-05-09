'use strict';

// Load modules

const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Inert = require('..');
const Lab = require('lab');
const Path = require('path');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('security', () => {

    const provisionServer = () => {

        const server = new Hapi.Server();
        server.connection({ routes: { files: { relativeTo: __dirname } } });
        server.register(Inert, Hoek.ignore);
        return server;
    };

    it('blocks path traversal to files outside of hosted directory is not allowed with null byte injection', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/%00/../security.js', (res) => {

            expect(res.statusCode).to.equal(404);
            done();
        });
    });

    it('blocks path traversal to files outside of hosted directory is not allowed', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/../security.js', (res) => {

            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with encoded slash', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/..%2Fsecurity.js', (res) => {

            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with double encoded slash', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/..%252Fsecurity.js', (res) => {

            expect(res.statusCode).to.equal(404);
            done();
        });
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with unicode encoded slash', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/..\u2216security.js', (res) => {

            expect(res.statusCode).to.equal(404);
            done();
        });
    });

    it('blocks null byte injection when serving a file', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/index%00.html', (res) => {

            expect(res.statusCode).to.equal(404);
            done();
        });
    });

    it('blocks access to files outside of base directory for file handler', (done) => {

        const server = provisionServer();

        const secureHandler = { file: { confine: './directory', path: Path.join(__dirname, 'security.js') } };
        server.route({ method: 'GET', path: '/secure', handler: secureHandler });
        server.route({ method: 'GET', path: '/open', handler: Hoek.applyToDefaults(secureHandler, { file: { confine: false } }) });

        server.inject('/secure', (res1) => {

            expect(res1.statusCode).to.equal(403);
            server.inject('/open', (res2) => {

                expect(res2.statusCode).to.equal(200);
                done();
            });
        });
    });

    it('blocks path traversal to files outside of base directory for file handler', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/file', handler: { file: { confine: './directory', path: '../security.js' } } });

        server.inject('/file', (res) => {

            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('blocks access to files outside of base directory for reply.file()', (done) => {

        const server = provisionServer();
        const fileHandler = (request, reply) => {

            reply.file(Path.join(__dirname, 'security.js'), { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        server.inject('/file', (res) => {

            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('blocks path traversal to files outside of base directory for reply.file()', (done) => {

        const server = provisionServer();
        const fileHandler = (request, reply) => {

            reply.file('../security.js', { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        server.inject('/file', (res) => {

            expect(res.statusCode).to.equal(403);
            done();
        });
    });
});
