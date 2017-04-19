/*!
 * apiai
 * Copyright(c) 2015 http://api.ai/
 * Apache 2.0 Licensed
 */

'use strict';

var QueryProxyRequest = require('./query_proxyrequest').QueryProxyRequest;
var util = require('util');
var log4js = require('log4js');
var logger = log4js.getLogger("botws");
//var Errlogger = log4js.getLogger('errorlog');

exports.TextProxyRequest = module.exports.TextProxyRequest = TextProxyRequest;

util.inherits(TextProxyRequest, QueryProxyRequest);

function TextProxyRequest (application, query, options) {
    logger.debug("text_request.js===TextRequestCons");
    
    TextProxyRequest.super_.apply(this, [application, options]);
    var self = this;
    self.query = query;
}

TextProxyRequest.prototype._headers = function() {
    logger.debug("text_request.js===_headers");
   
    var headers = TextProxyRequest.super_.prototype._headers.apply(this, arguments);
    headers['Content-Type'] = 'application/json; charset=utf-8';

    return headers;
};

TextProxyRequest.prototype._jsonRequestParameters = function() {
    var self = this;
    logger.debug("text_request.js===_jsonRequestParameters");
    var json = TextProxyRequest.super_.prototype._jsonRequestParameters.apply(this, arguments);

    json['query'] = self.query;
    
    logger.debug("text_request.js self.query=" + JSON.stringify( self.query));

    return json;
};

TextProxyRequest.prototype.end = function() {
    var self = this;

    self.write(JSON.stringify(self._jsonRequestParameters()));
    logger.debug("TextRequest.prototype.end " + JSON.stringify(self._jsonRequestParameters()));
    TextProxyRequest.super_.prototype.end.apply(this, arguments);
};

TextProxyRequest.prototype.end2 = function () {
    var self = this;
    
    var json = JSON.stringify(self._jsonRequestParameters());
    this.reqBody = json;
    TextProxyRequest.super_.prototype.end2.apply(this, arguments);
};

