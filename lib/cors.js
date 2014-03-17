"use strict";

/**
 * Cross Origin Resource Sharing
 */
module.exports = function(request, response) {

    var h = '';

    if (h = request.headers.origin) {

        response.setHeader('Access-Control-Allow-Origin', h);
        response.setHeader('Access-Control-Allow-Credentials', 'true');

        if (request.method == 'OPTIONS') {

            if (h = request.headers['access-control-request-method']) {
                response.setHeader('Access-Control-Allow-Methods', h);
            }

            if (h = request.headers['access-control-request-headers']) {
                response.setHeader('Access-Control-Allow-Headers', h);
            }

        }

    }

};
