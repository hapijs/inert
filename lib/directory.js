'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Boom = require('boom');
const Hoek = require('hoek');
const Items = require('items');
const Joi = require('joi');
const File = require('./file');


// Declare internals

const internals = {};


internals.schema = Joi.object({
    path: Joi.alternatives(Joi.array().items(Joi.string()).single(), Joi.func()).required(),
    index: Joi.alternatives(Joi.boolean(), Joi.array().items(Joi.string()).single()).default(true),
    listing: Joi.boolean(),
    showHidden: Joi.boolean(),
    redirectToSlash: Joi.boolean(),
    lookupCompressed: Joi.boolean(),
    etagMethod: Joi.string().valid('hash', 'simple').allow(false),
    defaultExtension: Joi.string().alphanum()
});


exports.handler = function (route, options) {

    const settings = Joi.attempt(options, internals.schema, 'Invalid directory handler options (' + route.path + ')');
    Hoek.assert(route.path[route.path.length - 1] === '}', 'The route path must end with a parameter:', route.path);

    const normalize = function (paths) {

        const normalized = [];
        for (let i = 0; i < paths.length; ++i) {
            let path = paths[i];

            if (!Hoek.isAbsolutePath(path)) {
                path = Path.join(route.settings.files.relativeTo, path);
            }

            normalized.push(path);
        }

        return normalized;
    };

    const normalized = (Array.isArray(settings.path) ? normalize(settings.path) : []);            // Array or function

    const indexNames = (settings.index === true) ? ['index.html'] : (settings.index || []);

    // Declare handler

    const handler = function (request, reply) {

        let paths = normalized;
        if (typeof settings.path === 'function') {
            const result = settings.path.call(null, request);
            if (result instanceof Error) {
                return reply(result);
            }

            if (Array.isArray(result)) {
                paths = normalize(result);
            }
            else if (typeof result === 'string') {
                paths = normalize([result]);
            }
            else {
                return reply(Boom.badImplementation('Invalid path function'));
            }
        }

        // Append parameter

        let selection = null;
        const lastParam = request.paramsArray[request.paramsArray.length - 1];
        if (lastParam) {
            if (lastParam.indexOf('..') !== -1) {
                return reply(Boom.forbidden());
            }

            selection = lastParam;
        }

        if (selection &&
            !settings.showHidden &&
            internals.isFileHidden(selection)) {

            return reply(Boom.notFound());
        }

        // Generate response

        const resource = request.path;
        const hasTrailingSlash = resource.endsWith('/');
        const fileOptions = { lookupCompressed: settings.lookupCompressed, etagMethod: settings.etagMethod };

        Items.serial(paths, (path, nextPath) => {

            path = Path.join(path, selection || '');

            File.load(path, request, fileOptions, (response) => {

                // File loaded successfully

                if (!response.isBoom) {
                    return reply(response);
                }

                // Not found

                const err = response;
                if (err.output.statusCode === 404) {
                    if (!settings.defaultExtension) {
                        return nextPath();
                    }

                    if (hasTrailingSlash) {
                        path = path.slice(0, -1);
                    }

                    return File.load(path + '.' + settings.defaultExtension, request, fileOptions, (extResponse) => {

                        if (!extResponse.isBoom) {
                            return reply(extResponse);
                        }

                        return nextPath();
                    });
                }

                // Propagate non-directory errors

                if (err.output.statusCode !== 403 || err.data !== 'EISDIR') {
                    return reply(err);
                }

                // Directory

                if (indexNames.length === 0 &&
                    !settings.listing) {

                    return reply(Boom.forbidden());
                }

                if (settings.redirectToSlash !== false &&                       // Defaults to true
                    !request.connection.settings.router.stripTrailingSlash &&
                    !hasTrailingSlash) {

                    return reply.redirect(resource + '/');
                }

                Items.serial(indexNames, (indexName, nextIndex) => {

                    const indexFile = Path.join(path, indexName);
                    File.load(indexFile, request, fileOptions, (indexResponse) => {

                        // File loaded successfully

                        if (!indexResponse.isBoom) {
                            return reply(indexResponse);
                        }

                        // Directory

                        const err = indexResponse;
                        if (err.output.statusCode !== 404) {
                            return reply(Boom.badImplementation(indexName + ' is a directory'));
                        }

                        // Not found, try the next one

                        return nextIndex();
                    });
                },
                (/* err */) => {

                    // None of the index files were found

                    if (!settings.listing) {
                        return reply(Boom.forbidden());
                    }

                    return internals.generateListing(path, resource, selection, hasTrailingSlash, settings, request, reply);
                });
            });
        },
        (/* err */) => {

            return reply(Boom.notFound());
        });
    };

    return handler;
};


internals.generateListing = function (path, resource, selection, hasTrailingSlash, settings, request, reply) {

    Fs.readdir(path, (err, files) => {

        if (err) {
            return reply(Boom.internal('Error accessing directory', err));
        }

        resource = decodeURIComponent(resource);
        const display = Hoek.escapeHtml(resource);
        let html = '<html><head><title>' + display + '</title></head><body><h1>Directory: ' + display + '</h1><ul>';

        if (selection) {
            const parent = resource.substring(0, resource.lastIndexOf('/', resource.length - (hasTrailingSlash ? 2 : 1))) + '/';
            html += '<li><a href="' + internals.pathEncode(parent) + '">Parent Directory</a></li>';
        }

        for (let i = 0; i < files.length; ++i) {
            if (settings.showHidden ||
                !internals.isFileHidden(files[i])) {

                html += '<li><a href="' + internals.pathEncode(resource + (selection && !hasTrailingSlash ? '/' : '') + files[i]) + '">' + Hoek.escapeHtml(files[i]) + '</a></li>';
            }
        }

        html += '</ul></body></html>';

        return reply(request.generateResponse(html));
    });
};


internals.isFileHidden = function (path) {

    return /(^|[\\\/])\.([^\\\/]|[\\\/]?$)/.test(path);           // Starts with a '.' or contains '/.' or '\.', and not followed by a '/' or '\' or end
};


internals.pathEncode = function (path) {

    return encodeURIComponent(path).replace(/%2F/g, '/').replace(/%5C/g, '\\');
};
