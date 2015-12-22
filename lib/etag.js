'use strict';

// Load modules

const Fs = require('fs');
const Crypto = require('crypto');
const Boom = require('boom');
const Hoek = require('hoek');
const LruCache = require('lru-cache');


// Declare internals

const internals = {};


internals.computeHashed = function (response, stat, next) {

    const etags = response.request.server.plugins.inert._etags;
    if (!etags) {
        return next(null, null);
    }

    // Use stat info for an LRU cache key.

    const path = response.source.path;
    const cachekey = [path, stat.ino, stat.size, stat.mtime.getTime()].join('-');

    // The etag hashes the file contents in order to be consistent across distributed deployments

    const cachedEtag = etags.get(cachekey);
    if (cachedEtag) {
        return next(null, cachedEtag);
    }

    const pendings = response.request.server.plugins.inert._pendings;
    const pendingsId = '+' + cachekey;                                  // Prefix to avoid conflicts with JS internals (e.g. __proto__)
    let nexts = pendings[pendingsId];
    if (nexts) {
        return nexts.push(next);
    }

    // Start hashing

    nexts = [next];
    pendings[pendingsId] = nexts;

    internals.hashFile(response, (err, hash) => {

        if (!err) {
            etags.set(cachekey, hash);
        }

        // Call pending callbacks

        delete pendings[pendingsId];
        for (let i = 0; i < nexts.length; ++i) {
            Hoek.nextTick(nexts[i])(err, hash);
        }
    });
};


internals.hashFile = function (response, callback) {

    const hash = Crypto.createHash('sha1');
    hash.setEncoding('hex');

    const fileStream = Fs.createReadStream(response.source.path, { fd: response.source.fd, autoClose: false });
    fileStream.pipe(hash);

    let done = function (err) {

        if (err) {
            return callback(Boom.wrap(err, null, 'Failed to hash file'));
        }

        return callback(null, hash.read());
    };

    done = Hoek.once(done);

    fileStream.on('end', done);
    fileStream.on('error', done);
};


internals.computeSimple = function (response, stat, next) {

    const size = stat.size.toString(16);
    const mtime = stat.mtime.getTime().toString(16);

    return next(null, size + '-' + mtime);
};


exports.apply = function (response, stat, next) {

    const etagMethod = response.source.settings.etagMethod;
    if (etagMethod === false) {
        return next();
    }

    const applyEtag = (err, etag) => {

        if (err) {
            return next(err);
        }

        if (etag !== null) {
            response.etag(etag, { vary: true });
        }

        return next();
    };

    if (etagMethod === 'simple') {
        return internals.computeSimple(response, stat, applyEtag);
    }

    return internals.computeHashed(response, stat, applyEtag);
};


exports.Cache = LruCache;
