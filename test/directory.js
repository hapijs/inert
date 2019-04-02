'use strict';

const Fs = require('fs');
const Os = require('os');
const Path = require('path');

const Boom = require('boom');
const Code = require('code');
const Hapi = require('hapi');
const Hoek = require('hoek');
const Inert = require('..');
const InertFs = require('../lib/fs');
const Lab = require('lab');


const internals = {};


const lab = exports.lab = Lab.script();
const describe = lab.describe;
const it = lab.it;
const expect = Code.expect;


describe('directory', () => {

    describe('handler()', () => {

        const provisionServer = async (connection, debug) => {

            const options = connection || { routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: false } };
            options.debug = debug;

            const server = new Hapi.Server(options);
            await server.register(Inert);
            return server;
        };

        it('returns a 403 when no index exists and listing is disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: '.' } } });      // Use '.' to test path normalization

            const res = await server.inject('/directory/');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(__dirname);
        });

        it('returns a 403 when requesting a path containing \'..\'', async () => {

            const forbidden = (request, h) => {

                return Boom.forbidden(null, {});
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });
            server.route({ method: 'GET', path: '/', handler: forbidden });

            const res = await server.inject('/directory/..');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.not.exist();
        });

        it('returns a 404 when requesting an unknown file within a directory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/directory/xyz');
            expect(res.statusCode).to.equal(404);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'xyz'));
        });

        it('returns a file when requesting a file from the directory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/directory/directory.js');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
        });

        it('returns a file when requesting a file from multi directory setup', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/multiple/{path*}', handler: { directory: { path: ['./', '../'], listing: true } } });

            const res = await server.inject('/multiple/package.json');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('name": "inert"');
        });

        it('returns a file when requesting a file from multi directory function response', async () => {

            const server = await provisionServer();
            server.route({
                method: 'GET',
                path: '/multiple/{path*}',
                handler: {
                    directory: {
                        path: () => {

                            return ['./', '../'];
                        },
                        listing: true
                    }
                }
            });

            const res = await server.inject('/multiple/package.json');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('name": "inert"');
        });

        it('returns 404 when the a fn directory handler returns an empty array', async () => {

            const directoryFn = (request) => {

                return [];
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryfn/{path?}', handler: { directory: { path: directoryFn } } });

            const res = await server.inject('/directoryfn/index.js');
            expect(res.statusCode).to.equal(404);
            expect(res.request.response._error.data.path).to.not.exist();
        });

        it('returns the correct file when requesting a file from a child directory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/directory/directory/index.html');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('test');
        });

        it('returns the correct listing links when viewing top level path', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('href="/file.js"');
        });

        it('returns the correct listing links when redirectToSlash is disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/base/{path*}', handler: { directory: { path: '.', index: false, listing: true, redirectToSlash: false } } });

            const res = await server.inject('/base');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('href="/base/file.js"');
        });

        it('does not contain any double / when viewing sub path listing', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/showindex/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.not.contain('//');
        });

        it('has the correct link to sub folders when inside of a sub folder listing', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/showindex/directory/subdir/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('href="/showindex/directory/subdir/subsubdir"');
        });

        it('has the correct link to a sub folder with spaces when inside of a sub folder listing', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/showindex/directory/subdir/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('href="/showindex/directory/subdir/sub%20subdir%3D"');
        });

        it('has the correct link to a file when inside of a listing of a sub folder that is inside a subfolder with spaces', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/showindex/directory/subdir/sub%20subdir%3D/subsubsubdir/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('href="/showindex/directory/subdir/sub%20subdir%3D/subsubsubdir/test.txt"');
        });

        it('returns the correct file when requesting a file from a directory with spaces', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/directory/directory/subdir/sub%20subdir%3D/test%24.json');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.equal('{"test":"test"}');
        });

        it('returns the correct file when requesting a file from a directory that its parent directory has spaces', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/directory/directory/subdir/sub%20subdir%3D/subsubsubdir/test.txt');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.equal('test');
        });

        it('returns a 403 when index and listing are disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryx/{path*}', handler: { directory: { path: '../', index: false } } });

            const res = await server.inject('/directoryx/');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, '..'));
        });

        it('returns a list of files when listing is enabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            const res = await server.inject('/directorylist/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('package.json');
        });

        it('returns a list of files for subdirectory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            const res = await server.inject('/directorylist/test/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('directory.js');
        });

        it('returns a list of files when listing is enabled and index disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directorylistx/{path*}', handler: { directory: { path: '../', listing: true, index: false } } });

            const res = await server.inject('/directorylistx/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('package.json');
        });

        it('returns the "index.html" index file when found and default index enabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/' } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('<p>test</p>');
        });

        it('returns the "index.html" index file when route contains multiple path segments', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory{index}/{path*}', handler: { directory: { path: './directory/' } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('<p>test</p>');
        });

        it('returns the index file when found and single custom index file specified', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'index.js' } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('var isTest = true;');
        });

        it('returns the first index file found when an array of index files is specified', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: ['default.html', 'index.js', 'non.existing'] } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('var isTest = true;');
        });

        it('returns a 403 when listing is disabled and a custom index file is specified but not found', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'default.html' } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'directory'));
        });

        it('returns a 403 when listing is disabled and an array of index files is specified but none were found', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: ['default.html', 'non.existing'] } } });

            const res = await server.inject('/directoryIndex/');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'directory'));
        });

        it('returns the index when served from a hidden folder', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory/.dot' } } });

            const res1 = await server.inject('/index.html');
            expect(res1.statusCode).to.equal(200);
            expect(res1.payload).to.contain('<p>test</p>');

            const res2 = await server.inject('/');
            expect(res2.statusCode).to.equal(200);
            expect(res2.payload).to.contain('<p>test</p>');
        });

        it('returns listing when served from a hidden folder', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory/.dot', index: false, listing: true } } });

            const res = await server.inject('/');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('index.html');
        });

        it('returns a 500 when index.html is a directory', async () => {

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/' } } });

            const res = await server.inject('/directoryIndex/invalid/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('index.html is a directory');
        });

        it('returns a 500 when the custom index is a directory', async () => {

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'misc' } } });

            const res = await server.inject('/directoryIndex/invalid/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('misc is a directory');
        });

        it('returns the correct file when using a fn directory handler', async () => {

            const directoryFn = (request) => {

                return '../lib';
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directoryfn/{path?}', handler: { directory: { path: directoryFn } } });

            const res = await server.inject('/directoryfn/index.js');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('export');
        });

        it('returns listing with hidden files when hidden files should be shown', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showhidden/{path*}', handler: { directory: { path: './', showHidden: true, listing: true } } });

            const res = await server.inject('/showhidden/');
            expect(res.payload).to.contain('.hidden');
        });

        it('returns listing without hidden files when hidden files should not be shown', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './', listing: true } } });

            const res = await server.inject('/noshowhidden/');
            expect(res.payload).to.not.contain('.hidden');
            expect(res.payload).to.contain('directory.js');
        });

        it('returns a 404 response when requesting a hidden file when showHidden is disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './', listing: true } } });

            const res = await server.inject('/noshowhidden/.hidden');
            expect(res.statusCode).to.equal(404);
        });

        it('returns a 404 response when requesting a file in a hidden directory when showHidden is disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', listing: true } } });

            const res1 = await server.inject('/noshowhidden/.dot/index.html');
            expect(res1.statusCode).to.equal(404);

            const res2 = await server.inject('/noshowhidden/.dot/');
            expect(res2.statusCode).to.equal(404);
        });

        it('returns a 404 response when requesting a hidden directory listing when showHidden is disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', listing: true, index: false } } });

            const res = await server.inject('/noshowhidden/.dot/');
            expect(res.statusCode).to.equal(404);
        });

        it('returns a file when requesting a hidden file when showHidden is enabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/showhidden/{path*}', handler: { directory: { path: './', showHidden: true, listing: true } } });

            const res = await server.inject('/showhidden/.hidden');
            expect(res.payload).to.contain('Ssssh!');
        });

        it('returns a a file when requesting a file in a hidden directory when showHidden is enabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', showHidden: true, listing: true } } });

            const res1 = await server.inject('/noshowhidden/.dot/index.html');
            expect(res1.statusCode).to.equal(200);
            expect(res1.payload).to.contain('test');

            const res2 = await server.inject('/noshowhidden/.dot/');
            expect(res2.statusCode).to.equal(200);
            expect(res2.payload).to.contain('test');
        });

        it('redirects to the same path with / appended if asking for a directory', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('/redirect/directory/subdir');
            expect(res.statusCode).to.equal(302);
            expect(res.headers.location).to.equal('/redirect/directory/subdir/');
        });

        it('does not redirect to the same path with / appended redirectToSlash disabled', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true, redirectToSlash: false } } });

            const res = await server.inject('http://example.com/redirect/directory/subdir');
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.contain('<html>');
        });

        it('does not redirect to the same path with / appended when server stripTrailingSlash is true', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: true } });
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            const res = await server.inject('http://example.com/redirect/directory/subdir');
            expect(res.statusCode).to.equal(200);
            expect(res.result).to.contain('<html>');
        });

        it('ignores unused path params', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{ignore}/4/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/crap/4/file.js');
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
        });

        it('returns error when failing to prepare file response due to bad state', async () => {

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.ext('onRequest', (request, h) => {

                h.state('bad', {});
                return h.continue;
            });

            const res = await server.inject('/directory/file.js');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error(/^Invalid cookie value/);
        });

        it('returns error when listing fails due to directory read error', { parallel: false }, async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            const orig = InertFs.readdir;
            InertFs.readdir = (path) => {

                InertFs.readdir = orig;
                throw new Error('Simulated Directory Error');
            };

            const res = await server.inject('/directorylist/');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('Error accessing directory: Simulated Directory Error');
        });

        it('appends default extension', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            const res = await server.inject('/directory/directory/index');
            expect(res.statusCode).to.equal(200);
        });

        it('appends default extension when resource ends with /', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            const res = await server.inject('/directory/directory/index/');
            expect(res.statusCode).to.equal(200);
        });

        it('appends default extension and fails to find file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            const res = await server.inject('/directory/directory/none');
            expect(res.statusCode).to.equal(404);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'directory/none.html'));
        });

        it('appends default extension and errors on file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'dir' } } });

            const res = await server.inject('/directory/directory/index');
            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'directory/index.dir'));
        });

        it('does not append default extension when directory exists', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            const res = await server.inject('/directory/directory');
            expect(res.statusCode).to.equal(302);
        });

        it('resolves path name from plugin using specified path', async () => {

            const plugin = {
                register: (server, options) => {

                    server.path(__dirname);
                    server.route({ method: 'GET', path: '/test/{path*}', config: { handler: { directory: { path: Path.join('.', 'directory'), index: false, listing: false } } } });
                },
                name: 'directory test',
                version: '1.0'
            };

            const server = await provisionServer({ router: { stripTrailingSlash: false } });
            await server.register(plugin);

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(200);
        });

        it('resolves path name from plugin using relative path', async () => {

            const plugin = {
                register: (server, options) => {

                    server.route({ method: 'GET', path: '/test/{path*}', config: { handler: { directory: { path: Path.join('.', 'test', 'directory'), index: false, listing: false } } } });
                },
                name: 'directory test',
                version: '1.0'
            };

            const server = await provisionServer({ router: { stripTrailingSlash: false } });
            await server.register(plugin);

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(200);
        });

        it('resolves root pathnames', async () => {

            const server = await provisionServer({ router: { stripTrailingSlash: false } });
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.join(__dirname, 'directory') } } });

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(200);
        });

        it('resolves relative pathnames', async () => {

            const server = await provisionServer({ router: { stripTrailingSlash: false } });
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.join('.', 'test', 'directory') } } });

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(200);
        });

        it('resolves relative pathnames from relative relativeTo', async () => {

            const server = await provisionServer({ routes: { files: { relativeTo: './test' } }, router: { stripTrailingSlash: false } });
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.join('.', 'directory') } } });

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(200);
        });

        it('returns error when path function returns error', async () => {

            const path = () => {

                return Boom.badRequest('Really?!');
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path } } });

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(400);
            expect(res.result.message).to.equal('Really?!');
        });

        it('returns error when path function returns invalid response', async () => {

            const path = () => {

                return 5;
            };

            const server = await provisionServer(null, false);
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path } } });

            const res = await server.inject('/test/index.html');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('Invalid path function');
        });

        it('returns a gzipped file using precompressed file', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { directory: { path: './file', lookupCompressed: true } } });

            const res = await server.inject({ url: '/image.png', headers: { 'accept-encoding': 'gzip' } });
            expect(res.headers['content-type']).to.equal('image/png');
            expect(res.headers['content-encoding']).to.equal('gzip');

            const content = Fs.readFileSync('./test/file/image.png.gz');
            expect(res.headers['content-length']).to.equal(content.length);
            expect(res.rawPayload.length).to.equal(content.length);
        });

        it('respects the etagMethod option', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { directory: { path: './file', etagMethod: 'simple' } } });

            const res = await server.inject('/image.png');
            expect(res.headers.etag).to.match(/^".+-.+"$/);
        });

        it('returns a 403 when missing file read permission', async () => {

            const filename = Hoek.uniqueFilename(Os.tmpdir());
            Fs.writeFileSync(filename, 'data');

            let fd;
            if (process.platform === 'win32') {
                // make a permissionless file by unlinking an open file
                fd = Fs.openSync(filename, 'r');
                Fs.unlinkSync(filename);
            }
            else {
                Fs.chmodSync(filename, 0);
            }

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.dirname(filename) } } });

            const res = await server.inject('/test/' + Path.basename(filename));

            // cleanup
            if (typeof fd === 'number') {
                Fs.closeSync(fd);
            }
            else {
                Fs.unlinkSync(filename);
            }

            expect(res.statusCode).to.equal(403);
            expect(res.request.response._error.data.path).to.equal(filename);
        });

        it('returns error when a file open fails', async () => {

            const orig = InertFs.open;
            InertFs.open = function () {        // can return EMFILE error

                InertFs.open = orig;
                throw new Error('failed');
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/test/fail');
            expect(res.statusCode).to.equal(500);
            expect(res.request.response._error).to.be.an.error('Failed to open file: failed');
        });

        it('returns a 404 for null byte paths', async () => {

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/index%00.html');
            expect(res.statusCode).to.equal(404);
            expect(res.request.response._error.data.path).to.equal(Path.join(__dirname, 'index\u0000.html'));
        });

        it('only stats the file system once when requesting a file', async () => {

            const orig = InertFs.fstat;
            let callCnt = 0;
            InertFs.fstat = function (...args) {

                callCnt++;
                return orig.apply(InertFs, args);
            };

            const server = await provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            const res = await server.inject('/directory/directory.js');
            Fs.fstat = orig;
            expect(callCnt).to.equal(1);
            expect(res.statusCode).to.equal(200);
            expect(res.payload).to.contain('hapi');
        });
    });
});
