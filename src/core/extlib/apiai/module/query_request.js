/*!
 * apiai
 * Copyright(c) 2015 http://api.ai/
 * Apache 2.0 Licensed
 */

'use strict';

var Request = require('./request').Request;
var util = require('util');
var log4js = require('log4js');
var logger = log4js.getLogger("botws");
//var logger = log4js.getLogger('errorlog');

exports.QueryRequest = module.exports.QueryRequest = QueryRequest;

util.inherits(QueryRequest, Request);

function QueryRequest (application, options) {
    var self = this;
    logger.debug("query_request.js===QueryRequest");
    self.language = application.language;
    self.securecall = application.secure;
    if ('timezone' in options) {
        self.timezone = options.timezone;
    }  
  
    if ('resetContexts' in options) {
        self.resetContexts = options.resetContexts;
    }

    if ('contexts' in options) {
        self.contexts = options.contexts;
    }

    if ('entities' in options) {
        self.entities = options.entities;
    }

    if ('sessionId' in options) {
        self.sessionId = options.sessionId;
    }

    if ('version' in options) {
        self.version = options.version;
    }

    if ('requestSource' in application) {
        self.requestSource = application.requestSource;
    }

    if ('originalRequest' in options) {
        self.originalRequest = options.originalRequest;
    }

    QueryRequest.super_.apply(this, arguments);
}

QueryRequest.prototype._requestOptions = function() {
    var self = this;
    logger.debug("query_request.js=== _requestOptions");
    var path = 'query';
    
    if (self.hasOwnProperty("version")) {
        path += '?v=' + self.version;
    }

    var request_options = QueryRequest.super_.prototype._requestOptions.apply(this, arguments);
    
    request_options['path'] =  self.endpoint + path;
    request_options['method'] = 'POST';
    
    return request_options
};

QueryRequest.prototype._requestOptions2 = function () {
    logger.debug("query_request.js===_requestOptions2");
    var self = this;
    
    var path = 'query';
    
    if (self.hasOwnProperty("version")) {
        path += '?v=' + self.version;
    }
    
    var request_options = QueryRequest.super_.prototype._requestOptions2.apply(this, arguments);
    //console.warn("query_request.js=== _requestOptions" + JSON.stringify(request_options));
    //console.warn("query_request.js=== self" + JSON.stringify(self));
    var httpPrep = self.securecall ? "https://" : "http://";
    request_options['uri'] = httpPrep +  self.hostname + self.endpoint + path;
    request_options['method'] = 'POST';
    request_options['proxy'] = self.proxy;
    //request_options["body"] = request_options.body;
    //request_options['proxy'] = 'https:/';
    //var json =this._jsonRequestParameters();
    //request_options['body'] = json;
    return request_options;
};

QueryRequest.prototype._jsonRequestParameters = function() {
    var self = this;
    logger.debug("query_request.js===_jsonRequestParameters");
    var json = {
        'lang': self.language,
        'timezone': self.timezone
    };

    if ('resetContexts' in self) {
        json['resetContexts'] = self.resetContexts;
    }

    if ('contexts' in self) {
        json['contexts'] = self.contexts;
    }

    if ('entities' in self) {
        json['entities'] = self.entities;
    }

    if ('sessionId' in self) {
        json['sessionId'] = self.sessionId;
    }

    if ('originalRequest' in self) {
        json['originalRequest'] = self.originalRequest;
    }
    return json;
};
