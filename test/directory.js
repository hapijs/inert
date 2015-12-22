'use strict';

// Load modules

const Fs = require('fs');
const Os = require('os');
const Path = require('path');
const Boom = require('boom');
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


describe('directory', () => {

    describe('handler()', () => {

        const provisionServer = (connection, debug) => {

            const server = new Hapi.Server({ debug: debug });
            server.connection(connection || { routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: false } });
            server.register(Inert, Hoek.ignore);
            return server;
        };

        it('returns a 403 when no index exists and listing is disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: '.' } } });      // Use '.' to test path normalization

            server.inject('/directory/', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a 403 when requesting a path containing \'..\'', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.inject('/directory/..', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a 404 when requesting an unknown file within a directory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.inject('/directory/xyz', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a file when requesting a file from the directory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.inject('/directory/directory.js', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                done();
            });
        });

        it('returns a file when requesting a file from multi directory setup', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/multiple/{path*}', handler: { directory: { path: ['./', '../'], listing: true } } });

            server.inject('/multiple/package.json', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('name": "inert"');
                done();
            });
        });

        it('returns a file when requesting a file from multi directory function response', (done) => {

            const server = provisionServer();
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

            server.inject('/multiple/package.json', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('name": "inert"');
                done();
            });
        });

        it('returns the correct file when requesting a file from a child directory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.inject('/directory/directory/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('test');
                done();
            });
        });

        it('returns the correct listing links when viewing top level path', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('href="/file.js"');
                done();
            });
        });

        it('does not contain any double / when viewing sub path listing', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/showindex/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.not.contain('//');
                done();
            });
        });

        it('has the correct link to sub folders when inside of a sub folder listing', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/showindex/directory/subdir/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('href="/showindex/directory/subdir/subsubdir"');
                done();
            });
        });

        it('has the correct link to a sub folder with spaces when inside of a sub folder listing', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/showindex/directory/subdir/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('href="/showindex/directory/subdir/sub%20subdir%3D"');
                done();
            });
        });

        it('has the correct link to a file when inside of a listing of a sub folder that is inside a subfolder with spaces', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showindex/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/showindex/directory/subdir/sub%20subdir%3D/subsubsubdir/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('href="/showindex/directory/subdir/sub%20subdir%3D/subsubsubdir/test.txt"');
                done();
            });
        });

        it('returns the correct file when requesting a file from a directory with spaces', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/directory/directory/subdir/sub%20subdir%3D/test%24.json', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.equal('{"test":"test"}');
                done();
            });
        });

        it('returns the correct file when requesting a file from a directory that its parent directory has spaces', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/directory/directory/subdir/sub%20subdir%3D/subsubsubdir/test.txt', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.equal('test');
                done();
            });
        });

        it('returns a 403 when index and listing are disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryx/{path*}', handler: { directory: { path: '../', index: false } } });

            server.inject('/directoryx/', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a list of files when listing is enabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            server.inject('/directorylist/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('package.json');
                done();
            });
        });

        it('returns a list of files for subdirectory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            server.inject('/directorylist/test/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('directory.js');
                done();
            });
        });

        it('returns a list of files when listing is enabled and index disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directorylistx/{path*}', handler: { directory: { path: '../', listing: true, index: false } } });

            server.inject('/directorylistx/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('package.json');
                done();
            });
        });

        it('returns the "index.html" index file when found and default index enabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/' } } });

            server.inject('/directoryIndex/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('<p>test</p>');
                done();
            });
        });

        it('returns the index file when found and single custom index file specified', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'index.js' } } });

            server.inject('/directoryIndex/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('var isTest = true;');
                done();
            });
        });

        it('returns the first index file found when an array of index files is specified', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: ['default.html', 'index.js', 'non.existing'] } } });

            server.inject('/directoryIndex/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('var isTest = true;');
                done();
            });
        });

        it('returns a 403 when listing is disabled and a custom index file is specified but not found', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'default.html' } } });

            server.inject('/directoryIndex/', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns a 403 when listing is disabled and an array of index files is specified but none were found', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: ['default.html', 'non.existing'] } } });

            server.inject('/directoryIndex/', (res) => {

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns the index when served from a hidden folder', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory/.dot' } } });

            server.inject('/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('<p>test</p>');

                server.inject('/', (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    expect(res2.payload).to.contain('<p>test</p>');
                    done();
                });
            });
        });

        it('returns listing when served from a hidden folder', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './directory/.dot', index: false, listing: true } } });

            server.inject('/', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('index.html');
                done();
            });
        });

        it('returns a 500 when index.html is a directory', (done) => {

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/' } } });

            server.inject('/directoryIndex/invalid/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns a 500 when the custom index is a directory', (done) => {

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/directoryIndex/{path*}', handler: { directory: { path: './directory/', index: 'misc' } } });

            server.inject('/directoryIndex/invalid/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns the correct file when using a fn directory handler', (done) => {

            const directoryFn = (request) => {

                return '../lib';
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directoryfn/{path?}', handler: { directory: { path: directoryFn } } });

            server.inject('/directoryfn/index.js', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('export');
                done();
            });
        });

        it('returns listing with hidden files when hidden files should be shown', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showhidden/{path*}', handler: { directory: { path: './', showHidden: true, listing: true } } });

            server.inject('/showhidden/', (res) => {

                expect(res.payload).to.contain('.hidden');
                done();
            });
        });

        it('returns listing without hidden files when hidden files should not be shown', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './', listing: true } } });

            server.inject('/noshowhidden/', (res) => {

                expect(res.payload).to.not.contain('.hidden');
                expect(res.payload).to.contain('directory.js');
                done();
            });
        });

        it('returns a 404 response when requesting a hidden file when showHidden is disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './', listing: true } } });

            server.inject('/noshowhidden/.hidden', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a 404 response when requesting a file in a hidden directory when showHidden is disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', listing: true } } });

            server.inject('/noshowhidden/.dot/index.html', (res) => {

                expect(res.statusCode).to.equal(404);

                server.inject('/noshowhidden/.dot/', (res2) => {

                    expect(res2.statusCode).to.equal(404);
                    done();
                });
            });
        });

        it('returns a 404 response when requesting a hidden directory listing when showHidden is disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', listing: true, index: false } } });

            server.inject('/noshowhidden/.dot/', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('returns a file when requesting a hidden file when showHidden is enabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/showhidden/{path*}', handler: { directory: { path: './', showHidden: true, listing: true } } });

            server.inject('/showhidden/.hidden', (res) => {

                expect(res.payload).to.contain('Ssssh!');
                done();
            });
        });

        it('returns a a file when requesting a file in a hidden directory when showHidden is enabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/noshowhidden/{path*}', handler: { directory: { path: './directory', showHidden: true, listing: true } } });

            server.inject('/noshowhidden/.dot/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('test');

                server.inject('/noshowhidden/.dot/', (res2) => {

                    expect(res2.statusCode).to.equal(200);
                    expect(res2.payload).to.contain('test');
                    done();
                });
            });
        });

        it('redirects to the same path with / appended if asking for a directory', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('/redirect/directory/subdir', (res) => {

                expect(res.statusCode).to.equal(302);
                expect(res.headers.location).to.equal('/redirect/directory/subdir/');
                done();
            });
        });

        it('does not redirect to the same path with / appended redirectToSlash disabled', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true, redirectToSlash: false } } });

            server.inject('http://example.com/redirect/directory/subdir', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.contain('<html>');
                done();
            });
        });

        it('does not redirect to the same path with / appended when server stripTrailingSlash is true', (done) => {

            const server = provisionServer({ routes: { files: { relativeTo: __dirname } }, router: { stripTrailingSlash: true } });
            server.route({ method: 'GET', path: '/redirect/{path*}', handler: { directory: { path: './', index: true, listing: true } } });

            server.inject('http://example.com/redirect/directory/subdir', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.contain('<html>');
                done();
            });
        });

        it('ignores unused path params', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{ignore}/4/{path*}', handler: { directory: { path: './' } } });

            server.inject('/crap/4/file.js', (res) => {

                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                done();
            });
        });

        it('returns error when failing to prepare file response due to bad state', (done) => {

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.ext('onRequest', (request, reply) => {

                reply.state('bad', {});
                return reply.continue();
            });

            server.inject('/directory/file.js', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns error when listing fails due to directory read error', { parallel: false }, (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directorylist/{path*}', handler: { directory: { path: '../', listing: true } } });

            const orig = Fs.readdir;
            Fs.readdir = (path, callback) => {

                Fs.readdir = orig;
                return callback(new Error('Simulated Directory Error'));
            };

            server.inject('/directorylist/', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('appends default extension', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            server.inject('/directory/directory/index', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('appends default extension when resource ends with /', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            server.inject('/directory/directory/index/', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('appends default extension and fails to find file', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            server.inject('/directory/directory/none', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('does not append default extension when directory exists', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: __dirname, defaultExtension: 'html' } } });

            server.inject('/directory/directory', (res) => {

                expect(res.statusCode).to.equal(302);
                done();
            });
        });

        it('resolves path name from plugin using specified path', (done) => {

            const plugin = (server, options, next) => {

                server.path(__dirname);
                server.route({ method: 'GET', path: '/test/{path*}', config: { handler: { directory: { path: Path.join('.', 'directory'), index: false, listing: false } } } });
                return next();
            };
            plugin.attributes = {
                name: 'directory test',
                version: '1.0'
            };

            const server = provisionServer({ router: { stripTrailingSlash: false } });
            server.register({ register: plugin }, {}, () => { });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('resolves path name from plugin using relative path', (done) => {

            const plugin = (server, options, next) => {

                server.route({ method: 'GET', path: '/test/{path*}', config: { handler: { directory: { path: Path.join('.', 'test', 'directory'), index: false, listing: false } } } });
                return next();
            };
            plugin.attributes = {
                name: 'directory test',
                version: '1.0'
            };

            const server = provisionServer({ router: { stripTrailingSlash: false } });
            server.register({ register: plugin }, {}, () => { });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('resolves root pathnames', (done) => {

            const server = provisionServer({ router: { stripTrailingSlash: false } });
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.join(__dirname, 'directory') } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('resolves relative pathnames', (done) => {

            const server = provisionServer({ router: { stripTrailingSlash: false } });
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.join('.', 'test', 'directory') } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(200);
                done();
            });
        });

        it('returns error when path function returns error', (done) => {

            const path = () => {

                return Boom.badRequest('Really?!');
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: path } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(400);
                expect(res.result.message).to.equal('Really?!');
                done();
            });
        });

        it('returns error when path function returns invalid response', (done) => {

            const path = () => {

                return 5;
            };

            const server = provisionServer(null, false);
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: path } } });

            server.inject('/test/index.html', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns a gzipped file using precompressed file', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { directory: { path: './file', lookupCompressed: true } } });

            server.inject({ url: '/image.png', headers: { 'accept-encoding': 'gzip' } }, (res) => {

                expect(res.headers['content-type']).to.equal('image/png');
                expect(res.headers['content-encoding']).to.equal('gzip');

                const content = Fs.readFileSync('./test/file/image.png.gz');
                expect(res.headers['content-length']).to.equal(content.length);
                expect(res.rawPayload.length).to.equal(content.length);
                done();
            });
        });

        it('respects the etagMethod option', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{p*}', handler: { directory: { path: './file', etagMethod: 'simple' } } });

            server.inject('/image.png', (res) => {

                expect(res.headers.etag).to.match(/^".+-.+"$/);
                done();
            });
        });

        it('returns a 403 when missing file read permission', (done) => {

            const filename = Hoek.uniqueFilename(Os.tmpDir());
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

            const server = provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: Path.dirname(filename) } } });

            server.inject('/test/' + Path.basename(filename), (res) => {

                // cleanup
                if (typeof fd === 'number') {
                    Fs.closeSync(fd);
                }
                else {
                    Fs.unlinkSync(filename);
                }

                expect(res.statusCode).to.equal(403);
                done();
            });
        });

        it('returns error when a file open fails', (done) => {

            const orig = Fs.open;
            Fs.open = function () {        // can return EMFILE error

                Fs.open = orig;
                const callback = arguments[arguments.length - 1];
                callback(new Error('failed'));
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/test/{path*}', handler: { directory: { path: './' } } });

            server.inject('/test/fail', (res) => {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('returns a 404 for null byte paths', (done) => {

            const server = provisionServer();
            server.route({ method: 'GET', path: '/{path*}', handler: { directory: { path: './' } } });

            server.inject('/index%00.html', (res) => {

                expect(res.statusCode).to.equal(404);
                done();
            });
        });

        it('only stats the file system once when requesting a file', (done) => {

            const orig = Fs.fstat;
            let callCnt = 0;
            Fs.fstat = function () {

                callCnt++;
                return orig.apply(Fs, arguments);
            };

            const server = provisionServer();
            server.route({ method: 'GET', path: '/directory/{path*}', handler: { directory: { path: './' } } });

            server.inject('/directory/directory.js', (res) => {

                Fs.fstat = orig;
                expect(callCnt).to.equal(1);
                expect(res.statusCode).to.equal(200);
                expect(res.payload).to.contain('hapi');
                done();
            });
        });
    });
});
