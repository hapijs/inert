'use strict';

// Load modules

const Path = require('path');

const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Inert = require('..');
const Lab = require('lab');


// Declare internals

const internals = {};


// Test shortcuts

const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('security', () => {

    const provisionServer = async () => {

        const server = new Hapi.Server({ routes: { files: { relativeTo: __dirname } } });
        await server.register(Inert);
        return server;
    };

    it('blocks path traversal to files outside of hosted directory is not allowed with null byte injection', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/%00/../security.js');
        expect(res.statusCode).to.equal(404);
    });

    it('blocks path traversal to files outside of hosted directory is not allowed', async () => {

        const forbidden = (request, reply) => {

            return reply().code(403);
        };

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });
        server.route({ method: 'GET', path: '/security.js', handler: forbidden });

        const res = await server.inject('/../security.js');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with encoded slash', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/..%2Fsecurity.js');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with double encoded slash', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/..%252Fsecurity.js');
        expect(res.statusCode).to.equal(404);
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with unicode encoded slash', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/..\u2216security.js');
        expect(res.statusCode).to.equal(404);
    });

    it('blocks null byte injection when serving a file', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/index%00.html');
        expect(res.statusCode).to.equal(404);
    });

    it('blocks access to files outside of base directory for file handler', async () => {

        const server = await provisionServer();

        const secureHandler = { file: { confine: './directory', path: Path.join(__dirname, 'security.js') } };
        server.route({ method: 'GET', path: '/secure', handler: secureHandler });
        server.route({ method: 'GET', path: '/open', handler: Hoek.applyToDefaults(secureHandler, { file: { confine: false } }) });

        const res1 = await server.inject('/secure');
        expect(res1.statusCode).to.equal(403);
        const res2 = await server.inject('/open');
        expect(res2.statusCode).to.equal(200);
    });

    it('blocks path traversal to files outside of base directory for file handler', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/file', handler: { file: { confine: './directory', path: '../security.js' } } });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks access to files outside of base directory for reply.file()', async () => {

        const server = await provisionServer();
        const fileHandler = (request, reply) => {

            return reply.file(Path.join(__dirname, 'security.js'), { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks path traversal to files outside of base directory for reply.file()', async () => {

        const server = await provisionServer();
        const fileHandler = (request, reply) => {

            return reply.file('../security.js', { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });
});
