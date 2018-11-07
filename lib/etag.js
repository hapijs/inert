'use strict';

const Crypto = require('crypto');

const Boom = require('boom');
const Bounce = require('bounce');
const LruCache = require('lru-cache');


const internals = {
    pendings: Object.create(null)
};


internals.streamEnd = function (stream) {

    return new Promise((resolve, reject) => {

        stream.on('end', resolve);
        stream.on('error', reject);
    });
};


internals.computeHashed = async function (response, stat) {

    const etags = response.request.server.plugins.inert._etags;
    if (!etags) {
        return null;
    }

    // Use stat info for an LRU cache key.

    const path = response.source.path;
    const cachekey = [path, stat.ino, stat.size, stat.mtime.getTime()].join('-');

    // The etag hashes the file contents in order to be consistent across distributed deployments

    const cachedEtag = etags.get(cachekey);
    if (cachedEtag) {
        return cachedEtag;
    }

    let promise = internals.pendings[cachekey];
    if (promise) {
        return await promise;
    }

    // Start hashing

    const compute = async () => {

        try {
            const hash = await internals.hashFile(response);
            etags.set(cachekey, hash);

            return hash;
        }
        finally {
            delete internals.pendings[cachekey];
        }
    };

    internals.pendings[cachekey] = promise = compute();

    return await promise;
};


internals.hashFile = async function (response) {

    const hash = Crypto.createHash('sha1');
    hash.setEncoding('hex');

    const fileStream = response.source.file.createReadStream({ autoClose: false });
    fileStream.pipe(hash);

    try {
        await internals.streamEnd(fileStream);
        return hash.read();
    }
    catch (err) {
        Bounce.rethrow(err, 'system');
        throw Boom.boomify(err, { message: 'Failed to hash file', data: { path: response.source.path } });
    }
};


internals.computeSimple = function (response, stat) {

    const size = stat.size.toString(16);
    const mtime = stat.mtime.getTime().toString(16);

    return size + '-' + mtime;
};


exports.apply = async function (response, stat) {

    const etagMethod = response.source.settings.etagMethod;
    if (etagMethod === false) {
        return;
    }

    let etag;
    if (etagMethod === 'simple') {
        etag = internals.computeSimple(response, stat);
    }
    else {
        etag = await internals.computeHashed(response, stat);
    }

    if (etag !== null) {
        response.etag(etag, { vary: true });
    }
};


exports.Cache = LruCache;
