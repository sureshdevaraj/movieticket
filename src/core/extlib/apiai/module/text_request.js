/*!
 * apiai
 * Copyright(c) 2015 http://api.ai/
 * Apache 2.0 Licensed
 */

'use strict';

var QueryRequest = require('./query_request').QueryRequest;
var util = require('util');
var log4js = require('log4js');
var logger = log4js.getLogger("botws");
//var Errlogger = log4js.getLogger('errorlog');

exports.TextRequest = module.exports.TextRequest = TextRequest;

util.inherits(TextRequest, QueryRequest);

function TextRequest (application, query, options) {
    logger.debug("text_request.js===TextRequestCons");
    
    TextRequest.super_.apply(this, [application, options]);
    var self = this;
    self.query = query;
}

TextRequest.prototype._headers = function() {
    logger.debug("text_request.js===_headers");
   
    var headers = TextRequest.super_.prototype._headers.apply(this, arguments);
    headers['Content-Type'] = 'application/json; charset=utf-8';

    return headers;
};

TextRequest.prototype._jsonRequestParameters = function() {
    var self = this;
    logger.debug("text_request.js===_jsonRequestParameters");
    var json = TextRequest.super_.prototype._jsonRequestParameters.apply(this, arguments);

    json['query'] = self.query;
    
    logger.debug("text_request.js self.query=" + JSON.stringify( self.query));

    return json;
};

TextRequest.prototype.end = function() {
    var self = this;

    self.write(JSON.stringify(self._jsonRequestParameters()));
    logger.debug("TextRequest.prototype.end " + JSON.stringify(self._jsonRequestParameters()));
    TextRequest.super_.prototype.end.apply(this, arguments);
};

TextRequest.prototype.end2 = function () {
    var self = this;
    
    var json = JSON.stringify(self._jsonRequestParameters());
    this.reqBody = json;
    TextRequest.super_.prototype.end2.apply(this, arguments);
};

