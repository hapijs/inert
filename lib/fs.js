'use strict';

const Fs = require('fs/promises');

const Boom = require('@hapi/boom');
const Bounce = require('@hapi/bounce');
const Hoek = require('@hapi/hoek');


const internals = {
    methods: ['open', 'readdir'],
    notFound: new Set(['ENOENT', 'ENOTDIR'])
};


exports.File = class {

    constructor(path) {

        this.path = path;
        this.handle = null;
    }

    async open(mode) {

        Hoek.assert(this.handle === null);

        try {
            this.handle = await exports.open(this.path, mode);
        }
        catch (err) {
            const data = { path: this.path };

            if (this.path.indexOf('\u0000') !== -1 || internals.notFound.has(err.code)) {
                throw Boom.notFound(null, data);
            }

            if (err.code === 'EACCES' || err.code === 'EPERM') {
                data.code = err.code;
                throw Boom.forbidden(null, data);
            }

            throw Boom.boomify(err, { message: 'Failed to open file', data });
        }
    }

    close() {

        if (this.handle !== null) {
            Bounce.background(this.handle.close());
            this.handle = null;
        }
    }

    async stat() {

        Hoek.assert(this.handle !== null);

        try {
            const stat = await this.handle.stat();

            if (stat.isDirectory()) {
                throw Boom.forbidden(null, { code: 'EISDIR', path: this.path });
            }

            return stat;
        }
        catch (err) {
            this.close();

            Bounce.rethrow(err, ['boom', 'system']);
            throw Boom.boomify(err, { message: 'Failed to stat file', data: { path: this.path } });
        }
    }

    async openStat(mode) {

        await this.open(mode);
        return this.stat();
    }

    createReadStream(options) {

        Hoek.assert(this.handle !== null);

        return this.handle.createReadStream({ start: 0, ...options });
    }
};

// Export Fs methods to allow overriding

for (const method of internals.methods) {
    exports[method] = Fs[method].bind(Fs);
}
