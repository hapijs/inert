// Load modules

var Fs = require('fs');
var Crypto = require('crypto');
var Boom = require('boom');
var Hoek = require('hoek');
var LruCache = require('lru-cache');


// Declare internals

var internals = {};


internals.addHashedEtag = function (response, stat, callback) {

    var etags = response.request.server.plugins.inert._etags;
    if (!etags) {
        return callback();
    }

    // Use stat info for an LRU cache key.

    var path = response.source.path;
    var cachekey = [path, stat.ino, stat.size, stat.mtime.getTime()].join('-');

    // The etag hashes the file contents in order to be consistent across distributed deployments

    var cachedEtag = etags.get(cachekey);
    if (cachedEtag) {
        response.etag(cachedEtag, { vary: true });
        return callback();
    }

    // Perform the hashing

    var hash = Crypto.createHash('sha1');
    hash.setEncoding('hex');

    var fileStream = Fs.createReadStream(path, { fd: response.source.fd, autoClose: false });
    fileStream.pipe(hash);

    var done = function (err) {

        if (err) {
            return callback(Boom.wrap(err, null, 'Failed to hash file'));
        }

        var etag = hash.read();
        etags.set(cachekey, etag);

        response.etag(etag, { vary: true });

        return callback();
    };

    done = Hoek.once(done);

    fileStream.on('end', done);
    fileStream.on('error', done);
};


internals.addSimpleEtag = function (response, stat, callback) {

    var size = stat.size.toString(16);
    var mtime = stat.mtime.getTime().toString(16);

    response.etag(size + '-' + mtime, { vary: true });

    return callback();
};


exports.apply = function (response, stat, callback) {

    if (response.source.settings.etagMethod === false) {
        return callback();
    }

    if (response.source.settings.etagMethod === 'simple') {
        return internals.addSimpleEtag(response, stat, callback);
    }

    return internals.addHashedEtag(response, stat, callback);
};


exports.Cache = LruCache;
