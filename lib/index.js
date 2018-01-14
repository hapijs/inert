'use strict';

// Load modules

const Directory = require('./directory');
const Etag = require('./etag');
const File = require('./file');
const Hoek = require('hoek');
const Joi = require('joi');


// Declare internals

const internals = {
    schema: Joi.object({
        etagsCacheMaxSize: Joi.number().integer().min(0).default(1000)
    }).required()
};


internals.fileMethod = function (path, responseOptions) {

    // Set correct confine value

    responseOptions = responseOptions || {};

    if (typeof responseOptions.confine === 'undefined' || responseOptions.confine === true) {
        responseOptions.confine = '.';
    }

    Hoek.assert(responseOptions.end === undefined || +responseOptions.start <= +responseOptions.end, 'options.start must be less than or equal to options.end');

    return this.response(File.response(path, responseOptions, this.request));
};


exports.plugin = {
    pkg: require('../package.json'),
    once: true,

    register(server, options) {

        Hoek.assert(Object.keys(options).length === 0, 'Inert does not support registration options');
        const settings = Joi.attempt(Hoek.reach(server.settings.plugins, 'inert') || {}, internals.schema, 'Invalid "inert" server options');

        server.expose('_etags', settings.etagsCacheMaxSize > 0 ? new Etag.Cache(settings.etagsCacheMaxSize) : null);

        server.decorate('handler', 'file', File.handler);
        server.decorate('handler', 'directory', Directory.handler);
        server.decorate('toolkit', 'file', internals.fileMethod);
    }
};
