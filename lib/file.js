'use strict';

// Load modules

const Fs = require('fs');
const Path = require('path');
const Ammo = require('ammo');
const Boom = require('boom');
const Hoek = require('hoek');
const Joi = require('joi');
const Etag = require('./etag');


// Declare internals

const internals = {};


internals.schema = Joi.alternatives([
    Joi.string(),
    Joi.func(),
    Joi.object({
        path: Joi.alternatives(Joi.string(), Joi.func()).required(),
        confine: Joi.alternatives(Joi.string(), Joi.boolean()).default(true),
        filename: Joi.string(),
        mode: Joi.string().valid('attachment', 'inline').allow(false),
        lookupCompressed: Joi.boolean(),
        etagMethod: Joi.string().valid('hash', 'simple').allow(false)
    })
        .with('filename', 'mode')
]);


exports.handler = function (route, options) {

    let settings = Joi.attempt(options, internals.schema, 'Invalid file handler options (' + route.path + ')');
    settings = (typeof options !== 'object' ? { path: options, confine: '.' } : settings);
    settings.confine = settings.confine === true ? '.' : settings.confine;
    Hoek.assert(typeof settings.path !== 'string' || settings.path[settings.path.length - 1] !== '/', 'File path cannot end with a \'/\':', route.path);

    const handler = (request, reply) => {

        const path = (typeof settings.path === 'function' ? settings.path(request) : settings.path);
        return reply(exports.response(path, settings, request));
    };

    return handler;
};


exports.load = function (path, request, options, callback) {

    const response = exports.response(path, options, request, true);
    return internals.prepare(response, callback);
};


exports.response = function (path, options, request, _preloaded) {

    Hoek.assert(!options.mode || ['attachment', 'inline'].indexOf(options.mode) !== -1, 'options.mode must be either false, attachment, or inline');

    if (options.confine) {
        const confineDir = Path.resolve(request.route.settings.files.relativeTo, options.confine);
        path = Path.isAbsolute(path) ? Path.normalize(path) : Path.join(confineDir, path);

        // Verify that resolved path is within confineDir
        if (path.lastIndexOf(confineDir, 0) !== 0) {
            path = null;
        }
    }
    else {
        path = Path.isAbsolute(path) ? Path.normalize(path) : Path.join(request.route.settings.files.relativeTo, path);
    }

    const source = {
        path,
        settings: options,
        stat: null,
        fd: null
    };

    const prepare = _preloaded ? null : internals.prepare;

    return request.generateResponse(source, { variety: 'file', marshal: internals.marshal, prepare, close: internals.close });
};


internals.prepare = function (response, callback) {

    const path = response.source.path;

    if (path === null) {
        return process.nextTick(() => {

            return callback(Boom.forbidden(null, 'EACCES'));
        });
    }

    internals.openStat(path, 'r', (err, fd, stat) => {

        if (err) {
            return callback(err);
        }

        response.source.fd = fd;
        response.bytes(stat.size);

        if (!response.headers['content-type']) {
            response.type(response.request.server.mime.path(path).type || 'application/octet-stream');
        }

        response.header('last-modified', stat.mtime.toUTCString());

        if (response.source.settings.mode) {
            const fileName = response.source.settings.filename || Path.basename(path);
            response.header('content-disposition', response.source.settings.mode + '; filename=' + encodeURIComponent(fileName));
        }

        Etag.apply(response, stat, (err) => {

            if (err) {
                internals.close(response);
                return callback(err);
            }

            return callback(response);
        });
    });
};


internals.marshal = function (response, next) {

    if (!response.source.settings.lookupCompressed ||
        !response.request.connection.settings.compression ||
        response.request.info.acceptEncoding !== 'gzip') {

        return internals.openStream(response, response.source.path, next);
    }

    const gzFile = response.source.path + '.gz';
    internals.openStat(gzFile, 'r', (err, fd, stat) => {

        if (err) {
            return internals.openStream(response, response.source.path, next);
        }

        internals.close(response);
        response.source.fd = fd;

        response.bytes(stat.size);
        response.header('content-encoding', 'gzip');
        response.vary('accept-encoding');

        return internals.openStream(response, gzFile, next);
    });
};


internals.addContentRange = function (response, callback) {

    const request = response.request;
    const length = response.headers['content-length'];
    let range = null;

    if (Hoek.reach(request.route.settings, 'response.ranges') !== false) {     // Backwards compatible comparison
        if (request.headers.range && length) {

            // Check If-Range

            if (!request.headers['if-range'] ||
                request.headers['if-range'] === response.headers.etag) {            // Ignoring last-modified date (weak)

                // Check that response is not encoded once transmitted

                const mime = request.server.mime.type(response.headers['content-type'] || 'application/octet-stream');
                const encoding = (request.connection.settings.compression && mime.compressible && !response.headers['content-encoding'] ? request.info.acceptEncoding : null);

                if (encoding === 'identity' || !encoding) {

                    // Parse header

                    const ranges = Ammo.header(request.headers.range, length);
                    if (!ranges) {
                        const error = Boom.rangeNotSatisfiable();
                        error.output.headers['content-range'] = 'bytes */' + length;
                        return callback(error);
                    }

                    // Prepare transform

                    if (ranges.length === 1) {                                          // Ignore requests for multiple ranges
                        range = ranges[0];
                        response.code(206);
                        response.bytes(range.to - range.from + 1);
                        response.header('content-range', 'bytes ' + range.from + '-' + range.to + '/' + length);
                    }
                }
            }
        }

        response.header('accept-ranges', 'bytes');
    }

    return callback(null, range);
};


internals.openStream = function (response, path, next) {

    Hoek.assert(response.source.fd !== null, 'file descriptor must be set');

    const options = { fd: response.source.fd, start: 0 };

    internals.addContentRange(response, (err, range) => {

        if (err) {
            return next(err);
        }

        if (range) {
            options.start = range.from;
            options.end = range.to;
        }

        const fileStream = Fs.createReadStream(path, options);
        response.source.fd = null;              // Claim descriptor

        return next(null, fileStream);
    });
};


internals.openStat = function (path, mode, callback) {

    Fs.open(path, mode, (err, fd) => {

        if (err) {
            if (path.indexOf('\u0000') !== -1 || err.code === 'ENOENT') {
                return callback(Boom.notFound());
            }

            if (err.code === 'EACCES' || err.code === 'EPERM') {
                return callback(Boom.forbidden(null, err.code));
            }

            return callback(Boom.wrap(err, null, 'Failed to open file'));
        }

        Fs.fstat(fd, (err, stat) => {

            if (err) {
                Fs.close(fd, Hoek.ignore);
                return callback(Boom.wrap(err, null, 'Failed to stat file'));
            }

            if (stat.isDirectory()) {
                Fs.close(fd, Hoek.ignore);
                return callback(Boom.forbidden(null, 'EISDIR'));
            }

            return callback(null, fd, stat);
        });
    });
};


internals.close = function (response) {

    if (response.source.fd !== null) {
        Fs.close(response.source.fd, Hoek.ignore);
        response.source.fd = null;
    }
};
