'use strict';

// Load modules

const Util = require('util');

const Boom = require('boom');
const Bounce = require('bounce');
const Hoek = require('hoek');


// Declare internals

const internals = {
    methods: {
        promised: ['open', 'close', 'fstat', 'readdir'],
        raw: ['createReadStream']
    }
};


exports.File = function (path) {

    this.path = path;
    this.fd = null;
};


exports.File.prototype.open = async function (mode) {

    Hoek.assert(this.fd === null);

    try {
        this.fd = await exports.open(this.path, mode);
    }
    catch (err) {
        if (this.path.indexOf('\u0000') !== -1 || err.code === 'ENOENT') {
            throw Boom.notFound();
        }

        if (err.code === 'EACCES' || err.code === 'EPERM') {
            throw Boom.forbidden(null, err.code);
        }

        throw Boom.boomify(err, { message: 'Failed to open file' });
    }
};


exports.File.prototype.close = function () {

    if (this.fd !== null) {
        exports.close(this.fd).then(null, Hoek.ignore);
        this.fd = null;
    }
};


exports.File.prototype.stat = async function () {

    Hoek.assert(this.fd !== null);

    try {
        const stat = await exports.fstat(this.fd);

        if (stat.isDirectory()) {
            throw Boom.forbidden(null, 'EISDIR');
        }

        return stat;
    }
    catch (err) {
        this.close(this.fd);

        Bounce.rethrow(err, ['boom', 'system']);
        throw Boom.boomify(err, { message: 'Failed to stat file' });
    }
};


exports.File.prototype.openStat = async function (mode) {

    await this.open(mode);
    return this.stat();
};


exports.File.prototype.createReadStream = function (options) {

    Hoek.assert(this.fd !== null);

    options = Object.assign({ fd: this.fd, start: 0 }, options);

    const stream = exports.createReadStream(this.path, options);

    if (options.autoClose !== false) {
        this.fd = null;           // The stream now owns the fd
    }

    return stream;
};


// Export Fs methods

const NodeFs = require('fs');
for (let i = 0; i < internals.methods.raw.length; ++i) {
    const method = internals.methods.raw[i];
    exports[method] = NodeFs[method].bind(NodeFs);
}

for (let i = 0; i < internals.methods.promised.length; ++i) {
    const method = internals.methods.promised[i];
    exports[method] = Util.promisify(NodeFs[method]);
}
