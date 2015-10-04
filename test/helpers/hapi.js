// Load modules

var Hoek = require('hoek');
var Semver = require('semver');


// Declare internals

var internals = {};


internals.hapiNodeVersion = Hoek.reach(require('hapi/package'), 'engines.node');


internals.getHapi = function () {

    if (Semver.satisfies(process.versions.node, internals.hapiNodeVersion)) {

        return require('hapi');
    }

    return require('hapi-lts');
};


module.exports = internals.getHapi();
