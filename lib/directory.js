'use strict';

const Path = require('path');

const Boom = require('@hapi/boom');
const Bounce = require('@hapi/bounce');
const Hoek = require('@hapi/hoek');
const Validate = require('@hapi/validate');

const File = require('./file');
const Fs = require('./fs');


const internals = {};


internals.schema = Validate.object({
    path: Validate.alternatives(Validate.array().items(Validate.string()).single(), Validate.func()).required(),
    index: Validate.alternatives(Validate.boolean(), Validate.array().items(Validate.string()).single()).default(true),
    listing: Validate.boolean(),
    showHidden: Validate.boolean(),
    redirectToSlash: Validate.boolean(),
    lookupCompressed: Validate.boolean(),
    lookupMap: Validate.object().min(1).pattern(/.+/, Validate.string()),
    etagMethod: Validate.string().valid('hash', 'simple').allow(false),
    defaultExtension: Validate.string().alphanum()
});


internals.resolvePathOption = function (result) {

    if (result instanceof Error) {
        throw result;
    }

    if (typeof result === 'string') {
        return [result];
    }

    if (Array.isArray(result)) {
        return result;
    }

    throw Boom.internal('Invalid path function');
};


exports.handler = function (route, options) {

    const settings = Validate.attempt(options, internals.schema, 'Invalid directory handler options (' + route.path + ')');
    Hoek.assert(route.path[route.path.length - 1] === '}', 'The route path for a directory handler must end with a parameter:', route.path);

    const paramName = /\w+/.exec(route.path.slice(route.path.lastIndexOf('{')))[0];
    const basePath = route.settings.files.relativeTo;

    const normalized = (Array.isArray(settings.path) ? settings.path : null);                            // Array or function
    const indexNames = (settings.index === true) ? ['index.html'] : (settings.index || []);

    // Declare handler

    const handler = async (request, reply) => {

        const paths = normalized ?? internals.resolvePathOption(settings.path.call(null, request));

        // Append parameter

        const selection = request.params[paramName] ?? '';

        if (Path.isAbsolute(selection) ||
            internals.hasEncodedSeparator(request.path, selection)) {

            throw Boom.notFound(null, {});
        }

        if (selection &&
            !settings.showHidden &&
            internals.isFileHidden(selection)) {

            throw Boom.notFound(null, {});
        }

        if (!selection &&
            (request.server.settings.router.stripTrailingSlash || !request.path.endsWith('/'))) {

            request.path += '/';
        }

        // Generate response

        const resource = request.path;
        const hasTrailingSlash = resource.endsWith('/');
        const fileOptions = {
            confine: null,
            lookupCompressed: settings.lookupCompressed,
            lookupMap: settings.lookupMap,
            etagMethod: settings.etagMethod
        };

        const each = async (baseDir) => {

            fileOptions.confine = baseDir;

            let path = selection;
            let error;

            try {
                return await File.load(path, request, fileOptions);
            }
            catch (err) {
                Bounce.ignore(err, 'boom');
                error = err;
            }

            // Handle Not found

            if (internals.isNotFound(error)) {
                if (!settings.defaultExtension) {
                    throw error;
                }

                if (hasTrailingSlash) {
                    path = path.slice(0, -1);
                }

                return await File.load(path + '.' + settings.defaultExtension, request, fileOptions);
            }

            // Handle Directory

            if (internals.isDirectory(error)) {
                if (settings.redirectToSlash !== false &&                       // Defaults to true
                    !request.server.settings.router.stripTrailingSlash &&
                    !hasTrailingSlash) {

                    return reply.redirect(resource + '/');
                }

                for (const indexName of indexNames) {
                    const indexFile = Path.join(path, indexName);
                    try {
                        return await File.load(indexFile, request, fileOptions);
                    }
                    catch (err) {
                        Bounce.ignore(err, 'boom');

                        if (!internals.isNotFound(err)) {
                            throw Boom.internal(indexName + ' is a directory', err);
                        }

                        // Not found - try next
                    }
                }

                // None of the index files were found

                if (settings.listing) {
                    return internals.generateListing(Path.join(basePath, baseDir, path), resource, selection, hasTrailingSlash, settings, request);
                }
            }

            throw error;
        };

        for (let i = 0; i < paths.length; ++i) {
            try {
                return await each(paths[i]);
            }
            catch (err) {
                Bounce.ignore(err, 'boom');

                // Propagate any non-404 errors

                if (!internals.isNotFound(err) ||
                    i === paths.length - 1) {
                    throw err;
                }
            }
        }

        throw Boom.notFound(null, {});
    };

    return handler;
};


internals.generateListing = async function (path, resource, selection, hasTrailingSlash, settings, request) {

    let files;
    try {
        files = await Fs.readdir(path);
    }
    catch (err) {
        Bounce.rethrow(err, 'system');
        throw Boom.internal('Error accessing directory', err);
    }

    resource = decodeURIComponent(resource);
    const display = Hoek.escapeHtml(resource);
    let html = '<html><head><title>' + display + '</title></head><body><h1>Directory: ' + display + '</h1><ul>';

    if (selection) {
        const parent = resource.substring(0, resource.lastIndexOf('/', resource.length - (hasTrailingSlash ? 2 : 1))) + '/';
        html = html + '<li><a href="' + internals.pathEncode(parent) + '">Parent Directory</a></li>';
    }

    for (const file of files) {
        if (settings.showHidden ||
            !internals.isFileHidden(file)) {

            html = html + '<li><a href="' + internals.pathEncode(resource + (!hasTrailingSlash ? '/' : '') + file) + '">' + Hoek.escapeHtml(file) + '</a></li>';
        }
    }

    html = html + '</ul></body></html>';

    return request.generateResponse(html);
};


internals.isFileHidden = function (path) {

    return /(^|[\\\/])\.([^.\\\/]|\.[^\\\/])/.test(path);           // Starts with a '.' or contains '/.' or '\.', which is not followed by a '/' or '\' or '.'
};


internals.hasEncodedSeparator = function (path, selection) {

    // The router doesn't split on encoded separators but the decoded param does, so they could reach a file
    // another route was meant to handle

    if (!selection) {
        return false;
    }

    // A '\' is only a separator on Windows, where the router doesn't split on it either, encoded or not,
    // elsewhere it's a legit filename character

    // $lab:coverage:off$
    if (Path.sep === '\\' &&
        selection.includes('\\')) {

        return true;
    }
    // $lab:coverage:on$

    // We only want the raw segments the param was captured from, not the ones before it, which belong to
    // literals or other params (e.g. '@scope%2Fname' in /pkg/{name}/{path*}). The param always ends the
    // path, so we can take them from the end of the raw path, as many as the decoded param has parts:
    //
    //   /pkg/@scope%2Fname/deep/secret.txt    ->  'deep/secret.txt', 2 parts  ->  'deep/secret.txt', allowed
    //   /pkg/@scope%2Fname/deep%2Fsecret.txt  ->  'deep/secret.txt', 2 parts  ->  '@scope%2Fname/deep%2Fsecret.txt', rejected
    //
    // Without encoded slashes, the parts match the raw segments one to one. Each %2F adds a part to the decoded
    // param but not to the raw path, so we take more segments than needed, but the %2F is still included and
    // the request is rejected. Those are whole segments though, so an encoded slash in another param of the
    // same segment (e.g. {a}-{path}) is also rejected.

    const parts = selection.split('/').length;
    const raw = path.split('/').slice(-parts).join('/');
    return /%2F/i.test(raw);
};


internals.pathEncode = function (path) {

    return encodeURIComponent(path).replace(/%2F/g, '/').replace(/%5C/g, '\\');
};


internals.isNotFound = function (boom) {

    return boom.output.statusCode === 404;
};


internals.isDirectory = function (boom) {

    return boom.output.statusCode === 403 && boom.data.code === 'EISDIR';
};
