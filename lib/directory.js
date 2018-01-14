'use strict';

// Load modules

const Path = require('path');

const Boom = require('boom');
const Bounce = require('bounce');
const Hoek = require('hoek');
const Joi = require('joi');

const File = require('./file');
const Fs = require('./fs');


// Declare internals

const internals = {};


internals.schema = Joi.object({
    path: Joi.alternatives(Joi.array().items(Joi.string()).single(), Joi.func()).required(),
    index: Joi.alternatives(Joi.boolean(), Joi.array().items(Joi.string()).single()).default(true),
    listing: Joi.boolean(),
    showHidden: Joi.boolean(),
    redirectToSlash: Joi.boolean(),
    lookupCompressed: Joi.boolean(),
    lookupMap: Joi.object().min(1).pattern(/.+/, Joi.string()),
    etagMethod: Joi.string().valid('hash', 'simple').allow(false),
    defaultExtension: Joi.string().alphanum()
});


internals.normalizePaths = function (basePath, paths) {

    return paths.map((path) => {

        return Path.isAbsolute(path) ? path : Path.join(basePath, path);
    });
};


internals.resolvePathOption = function (basePath, result) {

    if (result instanceof Error) {
        throw result;
    }

    let paths;
    if (typeof result === 'string') {
        paths = [result];
    }
    else if (Array.isArray(result)) {
        paths = result;
    }
    else {
        throw Boom.internal('Invalid path function');
    }

    return internals.normalizePaths(basePath, paths);
};


exports.handler = function (route, options) {

    const settings = Joi.attempt(options, internals.schema, 'Invalid directory handler options (' + route.path + ')');
    Hoek.assert(route.path[route.path.length - 1] === '}', 'The route path for a directory handler must end with a parameter:', route.path);

    const paramName = /\w+/.exec(route.path.slice(route.path.lastIndexOf('{')))[0];
    const basePath = route.settings.files.relativeTo;
    const normalized = (Array.isArray(settings.path) ? internals.normalizePaths(basePath, settings.path) : null);            // Array or function
    const indexNames = (settings.index === true) ? ['index.html'] : (settings.index || []);

    // Declare handler

    const handler = async (request, reply) => {

        const paths = normalized || internals.resolvePathOption(basePath, settings.path.call(null, request));

        // Append parameter

        const selection = request.params[paramName];
        if (selection &&
            !settings.showHidden &&
            internals.isFileHidden(selection)) {

            throw Boom.notFound(null, {});
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

            let path = selection || '';
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
                    return internals.generateListing(Path.join(baseDir, path), resource, selection, hasTrailingSlash, settings, request);
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

    for (let i = 0; i < files.length; ++i) {
        if (settings.showHidden ||
            !internals.isFileHidden(files[i])) {

            html = html + '<li><a href="' + internals.pathEncode(resource + (selection && !hasTrailingSlash ? '/' : '') + files[i]) + '">' + Hoek.escapeHtml(files[i]) + '</a></li>';
        }
    }

    html = html + '</ul></body></html>';

    return request.generateResponse(html);
};


internals.isFileHidden = function (path) {

    return /(^|[\\\/])\.([^.\\\/]|\.[^\\\/])/.test(path);           // Starts with a '.' or contains '/.' or '\.', which is not followed by a '/' or '\' or '.'
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
