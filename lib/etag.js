// Load modules

var Fs = require('fs');
var Crypto = require('crypto');
var Boom = require('boom');
var Hoek = require('hoek');
var LruCache = require('lru-cache');


// Declare internals

var internals = {};


internals.computeHashed = function (response, stat, callback) {

    var etags = response.request.server.plugins.inert._etags;
    if (!etags) {
        return callback(null, null);
    }

    // Use stat info for an LRU cache key.

    var path = response.source.path;
    var cachekey = [path, stat.ino, stat.size, stat.mtime.getTime()].join('-');

    // The etag hashes the file contents in order to be consistent across distributed deployments

    var cachedEtag = etags.get(cachekey);
    if (cachedEtag) {
        return callback(null, cachedEtag);
    }

    internals.hashFile(response, function (err, hash) {

        if (err) {
            return callback(err);
        }

        etags.set(cachekey, hash);

        return callback(null, hash);
    });
};


internals.hashFile = function (response, callback) {

    var hash = Crypto.createHash('sha1');
    hash.setEncoding('hex');

    var fileStream = Fs.createReadStream(response.source.path, { fd: response.source.fd, autoClose: false });
    fileStream.pipe(hash);

    var done = function (err) {

        if (err) {
            return callback(Boom.wrap(err, null, 'Failed to hash file'));
        }

        return callback(null, hash.read());
    };

    done = Hoek.once(done);

    fileStream.on('end', done);
    fileStream.on('error', done);
};


internals.computeSimple = function (response, stat, callback) {

    var size = stat.size.toString(16);
    var mtime = stat.mtime.getTime().toString(16);

    return callback(null, size + '-' + mtime);
};


exports.apply = function (response, stat, callback) {

    var etagMethod = response.source.settings.etagMethod;
    if (etagMethod === false) {
        return callback();
    }

    var applyEtag = function (err, etag) {

        if (err) {
            return callback(err);
        }

        if (etag !== null) {
            response.etag(etag, { vary: true });
        }

        return callback();
    };

    if (etagMethod === 'simple') {
        return internals.computeSimple(response, stat, applyEtag);
    }

    return internals.computeHashed(response, stat, applyEtag);
};


exports.Cache = LruCache;
