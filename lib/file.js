// Load modules

var Fs = require('fs');
var Path = require('path');
var Crypto = require('crypto');
var Boom = require('boom');
var Hoek = require('hoek');
var Joi = require('joi');
var LruCache = require('lru-cache');


// Declare internals

var internals = {};


internals.schema = Joi.alternatives([
    Joi.string(),
    Joi.func(),
    Joi.object({
        path: Joi.alternatives(Joi.string(), Joi.func()).required(),
        filename: Joi.string(),
        mode: Joi.string().valid('attachment', 'inline').allow(false),
        lookupCompressed: Joi.boolean()
    })
        .with('filename', 'mode')
]);


exports.handler = function (route, options) {

    Joi.assert(options, internals.schema, 'Invalid file handler options (' + route.path + ')');
    var settings = (typeof options !== 'object' ? { path: options } : Joi.validate(options, internals.schema).value);
    Hoek.assert(typeof settings.path !== 'string' || settings.path[settings.path.length - 1] !== '/', 'File path cannot end with a \'/\':', route.path);

    var handler = function (request, reply) {

        var path = (typeof settings.path === 'function' ? settings.path(request) : settings.path);
        return reply(exports.response(path, settings, request));
    };

    return handler;
};


exports.load = function (path, request, options, callback) {

    var response = exports.response(path, options, request);
    return internals.prepare(response, callback);
};


exports.response = function (path, options, request) {

    options = options || {};
    Hoek.assert(!options.mode || ['attachment', 'inline'].indexOf(options.mode) !== -1, 'options.mode must be either false, attachment, or inline');

    var source = {
        path: Path.normalize(Hoek.isAbsolutePath(path) ? path : Path.join(request.route.settings.files.relativeTo, path)),
        settings: options,
        stat: null,
        fd: null
    };

    return request.generateResponse(source, { variety: 'file', marshal: internals.marshal, prepare: internals.prepare, close: internals.close });
};


internals.prepare = function (response, callback) {

    internals.close(response);                  // Close any leftover descriptors from previous prepare call

    var path = response.source.path;
    internals.openStat(path, 'r', function (err, fd, stat) {

        if (err) {
            return callback(err);
        }

        response.source.fd = fd;
        response.bytes(stat.size);

        if (!response.headers['content-type']) {
            response.type(response.request.server.mime.path(path).type || 'application/octet-stream');
        }

        response.header('last-modified', stat.mtime.toUTCString());

        var etags = response.request.server.plugins.inert._etags;
        if (etags) {

            // Use stat info for an LRU cache key.

            var cachekey = [path, stat.ino, stat.size, stat.mtime.getTime()].join('-');

            // The etag must hash the file contents in order to be consistent across distributed deployments

            var cachedEtag = etags.get(cachekey);
            if (cachedEtag) {
                response.etag(cachedEtag, { vary: true });
            }
            else {
                var hash = Crypto.createHash('sha1');
                response.on('peek', function (chunk) {

                    hash.update(chunk);
                });

                response.once('finish', function () {

                    var etag = hash.digest('hex');
                    etags.set(cachekey, etag);
                });
            }
        }

        if (response.source.settings.mode) {
            var fileName = response.source.settings.filename || Path.basename(path);
            response.header('content-disposition', response.source.settings.mode + '; filename=' + encodeURIComponent(fileName));
        }

        return callback(response);
    });
};


internals.marshal = function (response, next) {

    if (!response.source.settings.lookupCompressed ||
        response.request.info.acceptEncoding !== 'gzip') {

        return next(null, internals.openStream(response, response.source.path));
    }

    var gzFile = response.source.path + '.gz';
    internals.openStat(gzFile, 'r', function (err, fd, stat) {

        if (err) {
            return next(null, internals.openStream(response, response.source.path));
        }

        internals.close(response);
        response.source.fd = fd;

        response.bytes(stat.size);
        response.header('content-encoding', 'gzip');
        response.vary('accept-encoding');

        return next(null, internals.openStream(response, gzFile));
    });
};


internals.openStream = function (response, path) {

    Hoek.assert(response.source.fd !== null, 'file descriptor must be set');

    var fileStream = Fs.createReadStream(path, { fd: response.source.fd });
    response.source.fd = null;              // Claim descriptor
    return fileStream;
};


internals.openStat = function (path, mode, callback) {

    Fs.open(path, mode, function(err, fd) {

        if (err) {
            return callback(Boom.notFound());
        }

        Fs.fstat(fd, function(err, stat) {

            if (err) {
                Fs.close(fd, Hoek.ignore);
                return callback(Boom.wrap(err, null, 'failed to stat file'));
            }

            if (stat.isDirectory()) {
                Fs.close(fd, Hoek.ignore);
                return callback(Boom.forbidden());
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


exports.Etags = LruCache;
