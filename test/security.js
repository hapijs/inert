'use strict';

// Load modules

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

            expect(res.statusCode).to.equal(403);
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

            expect(res.statusCode).to.equal(403);
            done();
        });
    });

    it('blocks path traversal to files outside of hosted directory is not allowed with unicode encoded slash', (done) => {

        const server = provisionServer();
        server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory' } } });

        server.inject('/..\u2216security.js', (res) => {

            expect(res.statusCode).to.equal(403);
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
});
