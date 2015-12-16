'use strict';

// Load modules

const Hoek = require('hoek');
const Semver = require('semver');


// Declare internals

const internals = {};


internals.hapiNodeVersion = Hoek.reach(require('hapi/package'), 'engines.node');


internals.getHapi = function () {

    if (Semver.satisfies(process.versions.node, internals.hapiNodeVersion)) {

        return require('hapi');
    }

    return require('hapi-lts');
};


module.exports = internals.getHapi();
