/*!
 * apiai
 * Copyright(c) 2015 http://api.ai/
 * Apache 2.0 Licensed
 */

'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var https = require('https');
var http = require('http');
var requester = require("request");
var ServerError = require('./exceptions').ServerError;
var log4js = require('log4js');
var logger = log4js.getLogger("botws");
//var Errlogger = log4js.getLogger('errorlog');

exports.Request = module.exports.Request = Request;

util.inherits(Request, EventEmitter);

function Request(application, options) {
    var self = this;
    
    self.clientAccessToken = application.clientAccessToken;
    
    self.hostname = application.hostname;
    self.proxy = application.proxy;
    
    self.endpoint = options.endpoint;
    self.requestSource = application.requestSource;
    self.securecall = application.secure;
    var _http = application.secure ? https : http;

    var requestOptions = self._requestOptions();
    
    
    requestOptions.agent = application._agent;
    
    var request = _http.request(requestOptions, function(response) {
        var body = '';

        response.on('data', function(chunk) {
            body += chunk;
        });

        response.on('end', function() {
            if (response.statusCode >= 200 && response.statusCode <= 299) {
                try {
                    var json_body = JSON.parse(body);
                    //console.log ("request.js=="+body);
                    logger.debug("request.js==" + body);
                    self.emit('response', json_body);
                } catch (error) {
                    // JSON.parse can throw only one exception, SyntaxError
                    // All another exceptions throwing from user function,
                    // because it just rethrowing for better error handling.

                    if (error instanceof SyntaxError) {
                        self.emit('error', error);
                    } else {
                        throw error;
                    }
                }
            } else {
                var error = new ServerError(response.statusCode, body, 'Wrong response status code.');
                self.emit('error', error);
            }
        });
    });
    
    request.on('error', function (error) {
        self.emit('error', error);
    });
    
    self.request = request;
}

Request.prototype._headers = function() {
    var self = this;
    console.warn("request.js===_headers");
    return {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + self.clientAccessToken,
        'api-request-source': self.requestSource
    };
};

Request.prototype._requestOptions2 = function () {
    var self = this;
    console.warn("Request.js = _requestOptions2");
    return {
        hostname: self.hostname,
        headers: self._headers(),
    }
};


Request.prototype._requestOptions = function() {
    var self = this;

    return {
        hostname: self.hostname,
        headers: self._headers()
    };
};

Request.prototype.write = function(chunk) {
    this.request.write(chunk);
};

Request.prototype.end = function () {
    //console.log("IUnvoking End");
    logger.debug("IUnvoking End");
   
    this.request.end();
};



Request.prototype.end2 = function () {
    //console.log("IUnvoking End2");
    logger.debug("IUnvoking End2");
    var optionsX = this._requestOptions2();
    delete optionsX.hostname;
    optionsX.body = this.reqBody;
    //console.warn("Final Request" + JSON.stringify(optionsX));
    logger.debug("Final Request" + JSON.stringify(optionsX));
    
    requester(optionsX, function (err, resp, body) {
        // Handle the response
        if (err) {
            //console.warn("erroi" + err);
            logger.debug("Error in request.js for api.ai " + err);
            this.emit('error', err);
        } else {
            logger.debug("api.ai response after request " + JSON.stringify(resp));
            this.emit('response', JSON.parse(resp));
        }
    });
};
