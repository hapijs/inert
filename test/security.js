'use strict';

const Fs = require('fs');
const Http = require('http');
const Os = require('os');
const Path = require('path');

const Boom = require('@hapi/boom');
const Code = require('@hapi/code');
const File = require('@hapi/file');
const Hapi = require('@hapi/hapi');
const Hoek = require('@hapi/hoek');
const Inert = require('..');
const Lab = require('@hapi/lab');


const internals = {};


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

        const forbidden = (request, h) => {

            return h.response().code(403);
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
        expect(res.statusCode).to.equal(404);
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

    it('blocks absolute paths at top level path', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './' } } });

        // Confirm success with relative path
        const resRel = await server.inject('/directory.js');
        expect(resRel.statusCode).to.equal(200);

        const resAbs = await server.inject(`/${require.resolve('./directory.js')}`);
        expect(resAbs.statusCode).to.equal(404);
    });

    it('blocks absolute paths non-top level path', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

        // Confirm success with relative path
        const resRel = await server.inject('/directory/directory.js');
        expect(resRel.statusCode).to.equal(200);

        const resAbs = await server.inject(`/directory/${require.resolve('./directory.js')}`);
        expect(resAbs.statusCode).to.equal(404);
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

    it('blocks access to files outside of base directory for h.file()', async () => {

        const server = await provisionServer();
        const fileHandler = (request, h) => {

            return h.file(Path.join(__dirname, 'security.js'), { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks path traversal to files outside of base directory for h.file()', async () => {

        const server = await provisionServer();
        const fileHandler = (request, h) => {

            return h.file('../security.js', { confine: Path.join(__dirname, 'directory') });
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks sibling-prefix path traversal in directory handler', async () => {

        // 'directory-secret/' is a sibling of the served 'directory/'. Its absolute
        // path begins with the same string as the confine dir, so a raw string-prefix
        // check treats it as confined.

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        const res = await server.inject('/..%2fdirectory-secret/secret.txt');
        expect(res.statusCode).to.equal(404);
    });

    it('blocks sibling-prefix path traversal in directory handler when the param reaches confinement', async () => {

        // Encoded slashes are rejected before confinement and dot segments are normalized by the router,
        // so the param has to be tampered with to reach it

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });
        server.ext('onPreHandler', (request, h) => {

            request.params.path = '../directory-secret/secret.txt';
            return h.continue;
        });

        const res = await server.inject('/secret.txt');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks sibling-prefix path traversal for h.file() with default confine', async () => {

        const server = new Hapi.Server({ routes: { files: { relativeTo: Path.join(__dirname, 'directory') } } });
        await server.register(Inert);

        const fileHandler = (request, h) => {

            return h.file('../directory-secret/secret.txt');     // confine defaults to true
        };

        server.route({ method: 'GET', path: '/file', handler: fileHandler });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks sibling-prefix path traversal for file handler with explicit confine', async () => {

        const server = await provisionServer();
        server.route({
            method: 'GET',
            path: '/file',
            handler: { file: { confine: './directory', path: '../directory-secret/secret.txt' } }
        });

        const res = await server.inject('/file');
        expect(res.statusCode).to.equal(403);
    });

    it('blocks encoded slashes in directory handler', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory-protected' } } });

        const res1 = await server.inject('/deep/secret.txt');
        expect(res1.statusCode).to.equal(200);

        const res2 = await server.inject('/deep%2Fsecret.txt');
        expect(res2.statusCode).to.equal(404);

        const res3 = await server.inject('/deep%2fsecret.txt');
        expect(res3.statusCode).to.equal(404);
    });

    it('blocks encoded slashes from bypassing a more specific authenticated directory route', async () => {

        const server = await provisionServer();
        server.auth.scheme('always-reject', () => ({ authenticate: (request, h) => h.unauthenticated(Boom.unauthorized('authentication required')) }));
        server.auth.strategy('private-files', 'always-reject');

        const directory = { path: './directory-protected', index: false, listing: false, redirectToSlash: false };
        server.route({ method: 'GET', path: '/deep/{path*}', options: { auth: 'private-files' }, handler: { directory } });
        server.route({ method: 'GET', path: '/{path*}', options: { auth: false }, handler: { directory } });

        const res1 = await server.inject('/deep/secret.txt');
        expect(res1.statusCode).to.equal(401);

        const res2 = await server.inject('/deep%2Fsecret.txt');
        expect(res2.statusCode).to.equal(404);
        expect(res2.payload).to.not.contain('PRIVATE_FILE_CANARY');
    });

    it('blocks backslashes in directory handler', { skip: process.platform !== 'win32' }, async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory-protected' } } });

        const res = await server.inject('/deep%5Csecret.txt');
        expect(res.statusCode).to.equal(404);

        // server.inject() normalizes a literal '\' to '/', a real request doesn't

        await server.start();
        const statusCode = await new Promise((resolve, reject) => {

            Http.get({ host: '127.0.0.1', port: server.info.port, path: '/deep\\secret.txt' }, (incoming) => {

                incoming.resume();
                resolve(incoming.statusCode);
            }).on('error', reject);
        });

        await server.stop();
        expect(statusCode).to.equal(404);
    });

    it('allows encoded backslashes in directory handler when not a separator', { skip: process.platform === 'win32' }, async () => {

        const filename = File.uniqueFilename(Os.tmpdir()) + '\\secret.txt';
        Fs.writeFileSync(filename, 'data');

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.dirname(filename) } } });

        let res;
        try {
            res = await server.inject('/test/' + encodeURIComponent(Path.basename(filename)));
        }
        finally {
            Fs.unlinkSync(filename);
        }

        expect(res.statusCode).to.equal(200);
        expect(res.payload).to.equal('data');
    });

    it('allows encoded slashes in other params of directory handler', async () => {

        const server = await provisionServer();
        server.route({ method: 'GET', path: '/pkg/{name}/{path*}', handler: { directory: { path: './directory-protected', index: ['deep/secret.txt'] } } });

        const res1 = await server.inject('/pkg/@scope%2Fname/deep/secret.txt');
        expect(res1.statusCode).to.equal(200);
        expect(res1.request.params.name).to.equal('@scope/name');

        const res2 = await server.inject('/pkg/@scope%2Fname');
        expect(res2.statusCode).to.equal(200);

        const res3 = await server.inject('/pkg/@scope%2Fname/deep%2Fsecret.txt');
        expect(res3.statusCode).to.equal(404);
    });
});
