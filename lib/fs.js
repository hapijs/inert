'use strict';

// Load modules

const Boom = require('boom');
const Hoek = require('hoek');


// Declare internals

const internals = {
    methods: ['open', 'close', 'fstat', 'createReadStream', 'readdir']
};


exports.File = function (path) {

    this.path = path;
    this.fd = null;
};


exports.File.prototype.open = function (mode, callback) {

    Hoek.assert(this.fd === null);

    exports.open(this.path, mode, (err, fd) => {

        if (err) {
            if (this.path.indexOf('\u0000') !== -1 || err.code === 'ENOENT') {
                return callback(Boom.notFound());
            }

            if (err.code === 'EACCES' || err.code === 'EPERM') {
                return callback(Boom.forbidden(null, err.code));
            }

            return callback(Boom.boomify(err, { message: 'Failed to open file' }));
        }

        this.fd = fd;

        return callback();
    });
};


exports.File.prototype.close = function () {

    if (this.fd !== null) {
        exports.close(this.fd, Hoek.ignore);
        this.fd = null;
    }
};


exports.File.prototype.stat = function (callback) {

    Hoek.assert(this.fd !== null);

    exports.fstat(this.fd, (err, stat) => {

        if (err) {
            this.close(this.fd);
            return callback(Boom.boomify(err, { message: 'Failed to stat file' }));
        }

        if (stat.isDirectory()) {
            this.close(this.fd);
            return callback(Boom.forbidden(null, 'EISDIR'));
        }

        return callback(null, stat);
    });
};


exports.File.prototype.openStat = function (mode, callback) {

    this.open(mode, (err) => {

        if (err) {
            return callback(err);
        }

        this.stat(callback);
    });
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


// Export raw Fs methods

const NodeFs = require('fs');
for (let i = 0; i < internals.methods.length; ++i) {
    exports[internals.methods[i]] = NodeFs[internals.methods[i]].bind(NodeFs);
}
