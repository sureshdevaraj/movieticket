'use strict';

var apiai = require('./core/extlib/apiai/index.js');
var express = require('express');
var bodyParser = require('body-parser');
var uuid = require('node-uuid');
var request = require('request');
var JSONbig = require('json-bigint');
var async = require('async');
var log4js = require('log4js');
var fs = require('fs');
var util = require('util');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

var sendmail = require('sendmail')({
    silent: true
})

// we want to create

var config = require('./config/devconfig.json');
var ip_config = require('./config/ipconfig.json');

const vz_proxy = config.vz_proxy;
var REST_PORT = (process.env.PORT || process.env.port || process.env.OPENSHIFT_NODEJS_PORT || 8080);
var SEVER_IP_ADDR = process.env.OPENSHIFT_NODEJS_IP || process.env.HEROKU_IP || '127.0.0.1';
var APIAI_ACCESS_TOKEN = config.APIAIACCESSTOKEN;
var APIAI_LANG = 'en';
var FB_VERIFY_TOKEN = config.FBVERIFYTOKEN;
var FB_PAGE_ACCESS_TOKEN = config.FBPAGEACCESSTOKEN;
var APIAI_VERIFY_TOKEN = "verify123";
var apiAiService = apiai(APIAI_ACCESS_TOKEN, { language: APIAI_LANG, requestSource: "fb", proxy: config.vz_proxy, secure: true });
var sessionIds = new Map();
var xhr = new XMLHttpRequest();

const commonMessage = {"facebook":{"attachment":{"type":"template","payload":{"template_type":"button","text":"My bad, but I am having trouble finding what you are looking for. Can you try searching for something else? Or you can always click Get Support button to Chat with an agent.","buttons":[{"type":"postback","title":"More Options","payload":"More Options"},{"type":"postback","title":"Program Categories","payload":"show program categories"},{"type":"postback","title":"Get Support","payload":"Support"}]}}}}

log4js.configure({
    appenders:
    [
        {
            type: 'dateFile', filename: 'botws.log', category: 'botws', "pattern": "-yyyy-MM-dd", "alwaysIncludePattern": false
        },
        {
            type: 'logLevelFilter',

            level: 'Info',
            appender: {
                type: "dateFile",

                filename: 'botHistorylog.log',

                category: 'Historylog',
                "pattern": "-yyyy-MM-dd",
                "alwaysIncludePattern": false
            }
        }
    ]
});

var logger = log4js.getLogger("botws");
var ChatHistoryLog = log4js.getLogger('Historylog');

var app = express();
app.use(bodyParser.text({ type: 'application/json' }));

app.listen(REST_PORT, SEVER_IP_ADDR, function () {
    logger.debug('Rest service ready on port ' + REST_PORT);
});

app.get('/webhook/', function (req, res) {
    logger.debug("inside webhook get");
    if (req.query['hub.verify_token'] == FB_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);

        setTimeout(function () {
            doSubscribeRequest();
        }, 3000);
    } else {
        res.send('Error, wrong FB validation token');
    }
});

app.get('/apipolling/', function (req, res) {
    logger.debug("Inside api polling");
    try {
        var ebizResponse = "<?xml version=\"1.0\" encoding=\"utf-8\" ?><ebizcenter xmlns=\"http://tempuri.org/eBizCenter.xsd\"><version>1.2</version>";
        var sessioid = uuid.v1();

        var pollingtext = "Hi iam " + ip_config.IP.substr(7, 10) + " polling";
        //logger.debug("polling text " + pollingtext);

        var apiaiRequest = apiAiService.textProxyRequest(pollingtext, { sessionId: sessioid });
        //var apiaiRequest = apiAiService.textProxyRequest("Hi polling", { sessionId: sessioid });

        apiaiRequest.on('response', function (response) {

          //  logger.debug("Polling apiai response " + response);
            ebizResponse = ebizResponse + "<response code=\"S\"/><error/><parameters><parameter name=\"API.AI\" datatype= \"string\" paramtype=\"\">Success</parameter></parameters></ebizcenter>";
            res.send(ebizResponse);

        });

        apiaiRequest.on('error', function (error) {

            ebizResponse = ebizResponse + "<response code=\"F\"/><error><source_code>BE</source_code><description>[[[" + error + "]]]</description></error><parameters><parameter name=\"API.AI\" datatype= \"string\" paramtype=\"\">Failure</parameter></parameters></ebizcenter>";
            res.send(ebizResponse);
            logger.debug("Error on sending polling request to api.ai " + error);

        });

        apiaiRequest.end2();
    }
    catch (err) {
        logger.debug("Error in sending polling api.ai " + err);
        ebizResponse = ebizResponse + "<response code=\"F\"/><error><source_code>BE</source_code><description>[[[" + err + "]]]</description></error><parameters><parameter name=\"API.AI\" datatype= \"string\" paramtype=\"\">Failure</parameter></parameters></ebizcenter>";
        res.send(ebizResponse);
    }

});

// Pasha Code Change 01/02/2017 : Added the settimeout for weird behaviour.
app.post('/webhook/', function (req, res) {
    try {
        var data = JSONbig.parse(req.body);
        var sprinklerFlag = '';

        //logger.debug("Webhook body" + req.body);

        if (data.entry) {
            setTimeout(function () {
                var entries = data.entry;
                entries.forEach(function (entry) {

                    var messaging_events = entry.messaging;

                    if (messaging_events) {

                        messaging_events.forEach(function (event) {

                            if (event.sender) {
                                var SenderID = event.sender.id;
                            }

                            if (event.recipient) {
                                var RecipientID = event.recipient.id;
                            }

                            if (event.message) {
                                //Customer Query
                                var logdatetime = getDateTime();

                                var TimeStamp = event.timestamp;

                                var MessageID = event.message.mid;

                                var MessageText = event.message.text;


                                var isBotRespondedBack;

                                if (SenderID == config.Facebook_SenderID) {

                                    displayProgIndicator(false, RecipientID);

                                    if (event.message.text || event.message.attachment || event.message.attachments) {

                                        logger.debug("Bot responded back to user");
                                        isBotRespondedBack = "YES";
                                    }
                                    else {
                                        logger.debug("Bot Not responded back to user");
                                        isBotRespondedBack = "NO";
                                    }
                                }
                                else {

                                    logger.debug("User sent to Bot");
                                    displayProgIndicator(true, SenderID);

                                    var userCoversationArr = { printDateTime: '', UserRequestDate: logdatetime, interactionid: uuid.v1(), senderid: SenderID, receipentid: RecipientID, timestamp: TimeStamp, messageid: MessageID, CXquestion: MessageText, userreq: 'passed', apireqdatetime: '', action: '', intent: '', apiresdatetime: '', apiTimeTaken: '', apiaireq: 'Inprogress', ufdreqdatetime: '', ufdresdatetime: '', ufdTimeTaken: '', ufdreq: 'Notstarted', botresponsedatetime: '', botresponse: '', senttofb: 'Notyetsent', botresponsetime: '', isrecorded: '' };
									
                                    isBotRespondedBack = "User sent to Bot";

                                }
                            }
                            else if (event.postback) {

                                //Payload or Postback

                                var TimeStamp = event.timestamp;
                                var logdatetime = getDateTime();

                                var MessageText = event.postback.payload;

                                var isBotRespondedBack;

                                if (SenderID == config.Facebook_SenderID) {

                                    displayProgIndicator(false, RecipientID);

                                    if (event.postback.payload) {

                                        logger.debug("Bot responded back to user");
                                        isBotRespondedBack = "YES";
                                    }
                                    else {
                                        logger.debug("Bot Not responded back to user");
                                        isBotRespondedBack = "NO";
                                    }
                                }
                                else {
                                    logger.debug("User Sent to Facebook");

                                    if (MessageText.toLowerCase() == "chat with agent") {

                                        logger.debug("inside sprinkler postback");
                                        var inputstr = "<sprinkler>true</sprinkler>";

                                        var sessionStartTime = getDateTime();
                                        var sessionEndTime;

                                        async.series({
                                            one: function (callback) {
                                                var xVal = updateAndGetSession(SenderID, inputstr, "", "BotRequest1", function (data) {
                                                    callback(null, data);
                                                    //logger.debug('CallBack processevent add sprinkler flag to true from updateAndGetSession_1');
                                                });
                                            }
                                        }, function (err, results) {
                                            //logger.debug('Made sprinkler as true');

                                            sessionEndTime = getDateTime();
                                            getsecondstaken('session for Made sprinkler as true', sessionStartTime, sessionEndTime);

                                        });

                                        var userCoversationArr = { printDateTime: '', UserRequestDate: logdatetime, interactionid: uuid.v1(), senderid: SenderID, receipentid: RecipientID, timestamp: TimeStamp, messageid: 'Payload', CXquestion: '', userreq: 'passed', apireqdatetime: '', action: '', intent: '', apiresdatetime: '', apiTimeTaken: '', apiaireq: 'NA', ufdreqdatetime: '', ufdresdatetime: '', ufdTimeTaken: '', ufdreq: 'NA', botresponsedatetime: '', botresponse: '', senttofb: 'Notyetsent', botresponsetime: 'I am transferring you to someone who can help! An agent will be with you shortly.', isrecorded: '' };
                                        //staticMessages("CHATWITHAGENT", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });

										sendFBMessage(SenderID, { text: "I am transferring you to someone who can help! An agent will be with you shortly." }, userCoversationArr);

                                        return;
                                    }

                                    displayProgIndicator(true, SenderID);

                                    isBotRespondedBack = "User sent to FB Bot";
                                    
									var userCoversationArr = { printDateTime: '', UserRequestDate: logdatetime, interactionid: uuid.v1(), senderid: SenderID, receipentid: RecipientID, timestamp: TimeStamp, messageid: 'Payload', CXquestion: '', userreq: 'passed', apireqdatetime: '', action: '', intent: '', apiresdatetime: '', apiTimeTaken: '', apiaireq: 'Inprogress', ufdreqdatetime: '', ufdresdatetime: '', ufdTimeTaken: '', ufdreq: 'Notstarted', botresponsedatetime: '', botresponse: '', senttofb: 'Notyetsent', botresponsetime: '', isrecorded: '' };

                                    ///* Add record payload information into the session */
                                    //if (MessageText.indexOf('Payload') > -1) {

                                    //    var payarr = MessageText.split('|');
                                    //    //logger.debug(payarr);

                                    //    if (payarr != null) {
                                    //        var arr = payarr[1].split(':');
                                    //        if (arr[1] != undefined) {

                                    //            var inpustr = "<recorddetails>" + MessageText + "</recorddetails>";
                                    //            async.series({
                                    //				one: function (callback) {
                                    //					var xVal = updateAndGetSession_1(SenderID, inpustr, "", "BotRequest1",function (data) {
                                    //						callback(null, data);
                                    //					});
                                    //				}
                                    //			}, function (err, results) {
                                    //				logger.debug("Session Added " + results.one);
                                    //			});

                                    //            logger.debug("Payload Updated into session");
                                    //        }
                                    //        else 
                                    //            logger.debug("Payload not needed into the session");

                                    //    }
                                    //}

                                    //logger.debug("Retrieve the sprinkler flag - Payload");
                                    //sprinklerFlag = updateAndGetSession(SenderID, "", "sprinkler", "BotRequest1");
                                }

                                //ChatHistoryLog.info("|" + logdatetime + "|" + SenderID + "|" + RecipientID + "|" + TimeStamp + "| Payload | " + MessageText + "| Undefined | Undefined |" + isBotRespondedBack);
                            }
                            else if (event.account_linking) {
                                var TimeStamp = event.time;
                                var logdatetime = getDateTime();
                                var status = '';
                                if (event.account_linking.status)
                                    status = event.account_linking.status;

                                displayProgIndicator(true, SenderID);

                                var userCoversationArr = { printDateTime: '', UserRequestDate: logdatetime, interactionid: uuid.v1(), senderid: SenderID, receipentid: RecipientID, timestamp: TimeStamp, messageid: 'AccountLinking', CXquestion: status, userreq: 'passed', apireqdatetime: '', action: '', intent: '', apiresdatetime: '', apiTimeTaken: '', apiaireq: 'Inprogress', ufdreqdatetime: '', ufdresdatetime: '', ufdTimeTaken: '', ufdreq: 'Notstarted', botresponsedatetime: '', botresponse: '', senttofb: 'Notyetsent', botresponsetime: '', isrecorded: '' };

                            }

                            if (event.message && !event.message.is_echo ||
                                event.postback && event.postback.payload ||
                                event.account_linking) {

                                printChatHistory(userCoversationArr);

                                processEvent(event, userCoversationArr);

                            }
                        });
                    }
                });
            }, 250);
        }

        return res.status(200).json({
            status: "ok"
        });
    } catch (err) {
        logger.debug("Error in post api.ai " + err);
        res.status(200).json({
            status: "ok"
        });
    }
});

app.get('/deeplink', function (req, res) {
    var cType;
    var reqUrl;
    var redirectURL;
    var contentString;
    var redirectAppStoreURL = "https://itunes.apple.com/us/app/verizon-fios-mobile/id406387206";
    var redirectPlayStoreURL = "market://details?id=com.verizon.fiosmobile";

    var beginHtml = "<html><head><title></title><script type='text/javascript' charset='utf-8'>";
    var endHtml = "</script></head> <body> <img src='https://www.verizon.com/vzssobot/content/verizon-logo-200.png' /> </body> </html>";

    var iOSscript = " var isActive = true;  var testInterval = function () { if(isActive) { window.location='" + redirectAppStoreURL + "';} else {clearInterval(testInterval); testInterval = null;} }; window.onfocus = function () { if(!isActive) return; else {isActive = true;}}; window.onblur = function () { isActive = false; };  setInterval(testInterval, 5000); "

    var androidScript = " setTimeout(function () { window.location.replace('" + redirectPlayStoreURL + "'); }, 500); ";

    var contentType = req.query.ContentType;
    var userAgent = req.headers['user-agent'].toLowerCase();

    logger.debug("DeepLink-Started");
    logger.debug("User agent " + req.get('User-Agent'));

    cType = contentType ? ((contentType == 'MOVIE') ? 'MOV' : (contentType == 'SEASON') ? 'SEASON' : 'TVS') : 'TVS';

    if (userAgent.match(/(iphone|ipod|ipad)/)) {
        if (req.query.fiosID) {
            reqUrl = "/details?" + "fiosID=" + req.query.fiosID + "&ContentType=" + cType;
            if (req.query.SeriesID) {
                reqUrl = reqUrl + "&SeriesID=" + req.query.SeriesID;
            }
        }
        else if (cType == 'SEASON') {
            reqUrl = "/details?" + "SeriesID=" + encodeURI(req.query.SeriesID);
        }
        else if (req.query.PID && req.query.PAID) {
            reqUrl = "/details?" + "PID=" + req.query.PID + "&PAID=" + req.query.PAID;
        }
        else if (req.query.CID) {
            reqUrl = "/details?" + "CID=" + req.query.CID + "&ContentType=" + cType;
        }
        else if (req.query.IsLive) {
            reqUrl = "/WN";
        }
        else {
            reqUrl = "/APPLAUNCH";
        }
        redirectURL = 'vz-carbon://app' + reqUrl;

        //console.log("Request URL = " + redirectURL);

        contentString = beginHtml + "window.location = '" + redirectURL + "'; " + iOSscript + endHtml;
    }
    else if (userAgent.match(/(android)/)) {
        if (req.query.fiosID) {
            reqUrl = "/tvlistingdetail/" + req.query.fiosID;
        }
        else if (req.query.CID) {
            var conType = (cType == 'MOV') ? 'moviedetails' : 'tvepisodedetails';
            reqUrl = ".mm/" + conType + "/" + req.query.CID;
        }
        else if (req.query.IsLive) {
            reqUrl = "/fragmentname/watchnow";
        }
        else {
            reqUrl = "";
        }
        redirectURL = 'app://com.verizon.fiosmobile' + reqUrl;
        //console.log("Request URL = " + redirectURL);

        contentString = beginHtml + " window.location = '" + redirectURL + "'; " + androidScript + endHtml;
    }
    else {
        var uri = 'http://tv.verizon.com/';
        var callSign = req.query.CallSign;
        callSign = callSign ? ((callSign.slice(-2) == 'HD') ? callSign.slice(0, -2) : callSign) : '';
        redirectURL = req.query.IsLive ? (uri + 'livetv/' + callSign) : uri;
        contentString = beginHtml + " window.location='" + redirectURL + "'; " + endHtml;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(contentString);
    res.end();

    logger.debug("DeepLink-Ended");
});
//=================================

doSubscribeRequest();

function processEvent(event, userCoversationArr) {
	
	logger.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< START OF MESSAGE REQUEST >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");

    var sender = event.sender.id.toString();
    var inpustr = '';
    var msgText = ''

    if (event.message) {
        msgText = event.message.text;
        inpustr = '';
        inpustr = "<cxquestion>" + msgText + "</cxquestion>";
    }
    else if(event.postback) {

        /* Add record payload information into the session */
        inpustr = '';
        msgText = event.postback.payload;
        if (msgText.indexOf('Payload') > -1) {

            var payarr = msgText.split('|');

            if (payarr != null) {
                var arr = payarr[1].split(':');
                if (arr[1] != undefined) {

                    inpustr = "<recorddetails>" + msgText + "</recorddetails>";
                    logger.debug("Payload Need to update into session");
                }
                else
                    logger.debug("Payload not needed into the session");
            }
        }
    }

    /* Start Retrieve and Add to session */
    var sessionStartTime = getDateTime();
    var sessionEndTime;
    async.series({
        one: function (callback) {
            if (inpustr != '') {

                var xVal = updateAndGetSession(sender, inpustr, "sprinkler", "BotRequest1", function (data) {

                    callback(null, data);

                    logger.debug('CallBack processevent add and retrieve sprinkler flag from updateAndGetSession_1');
                });
            }
            else {
                var xVal = updateAndGetSession(sender, "", "sprinkler", "BotRequest1", function (data) {

                    callback(null, data);

                    logger.debug('CallBack processevent only retrieve sprinkler flag from updateAndGetSession_1');
                });
            }

        }
    }, function (err, results) {

        var sprinklerFlag = results.one;
        logger.debug("sprinklerFlag value : " + sprinklerFlag);

        sessionEndTime = getDateTime();
        getsecondstaken('session for checking sprinkler flag and also adding CX Question', sessionStartTime, sessionEndTime);

        if ((event.message && event.message.text) || (event.postback && event.postback.payload)) {

            var text = event.message ? event.message.text : event.postback.payload;

            if (event.message && event.message.quick_reply && event.message.quick_reply.payload) text = event.message.quick_reply.payload;

            // Disabled the sprinkler flag check

            if (sprinklerFlag == 'true') {

                if (text.toUpperCase() == 'CHAT WITH BOT') {

                    //logger.debug('Inside CHTA WITH BOT');
                    var inpustr = "<sprinkler>false</sprinkler>";

                    var sessionStartTime = getDateTime();
                    var sessionEndTime;

                    async.series({
                        one: function (callback) {
                            var xVal = updateAndGetSession(sender, inpustr, "", "BotRequest1", function (data) {

                                callback(null, data);

                                logger.debug('CallBack processevent add sprinkler flag to false from updateAndGetSession_1');
                            });
                        }
                    }, function (err, results) {
                        logger.debug('Made sprinkler as false');

                        sessionEndTime = getDateTime();
                        getsecondstaken('session for making sprinkler false', sessionStartTime, sessionEndTime);
                    });
                }
                else
                    return;
            }

            logger.debug("Before Account Linking ");

            if (!sessionIds.has(sender)) {
                //logger.debug("Inside sessionID:- ");
                sessionIds.set(sender, uuid.v1());
            }

            var ReqSenderID = event.sender.id.toString();
            var ReqRecipientID = event.recipient.id.toString();
            var ReqMessageText = text;
            var ReqTimeStamp;
            var ReqMessageID;

            if (event.timestamp) {
                ReqTimeStamp = event.timestamp.toString();
            }

            if (event.message) {
                if (event.message.mid) {
                    ReqMessageID = event.message.mid.toString();
                }
            }

            if (event.postback && event.postback.payload && event.postback.payload.indexOf("RetryAuthCode|") > 0) {
                var authCode = event.postback.payload.split("|")[1];
                var paramArr = { authCodeParam: authCode, senderParam: sender, userIdParam: "" };

                getvzUserID(authCode, userCoversationArr, function (str) { getvzUserIDCallback(str, paramArr, userCoversationArr) });


            } else {

                // api.ai request moved to function
                callapiai(text, sender, sessionIds, userCoversationArr);
            }
        } else if (event.account_linking) {
            //logger.debug("event account_linking content :- " + JSON.stringify(event.account_linking));
            if (event.account_linking == undefined) {
              //  logger.debug("Account Linking null - 2");
            }
            else if (event.account_linking.status === "linked") {
                //logger.debug("Account Linking convert: Auth Code" + JSON.stringify(event.account_linking.authorization_code, null, 2));
                logger.debug("Account Linking convert: Status " + JSON.stringify(event.account_linking.status, null, 2));
                var authCode = event.account_linking.authorization_code;

                //delete event.account_linking;
                var paramArr = { authCodeParam: authCode, senderParam: sender, userIdParam: "" };
                userCoversationArr.ufdreqdatetime = getDateTime();
                getvzUserID(authCode, userCoversationArr, function (str) { getvzUserIDCallback(str, paramArr, userCoversationArr) });

            } else if (event.account_linking.status === "unlinked") {
                //Place holder code to unlink.
                logger.debug("Account unlinked");
                userCoversationArr.ufdreqdatetime = getDateTime();
                DeleteAuthProfile(sender, userCoversationArr, function (str) { DeleteAuthProfileCallback(str, sender, userCoversationArr) });
            }
        }
    });
}

function callapiai(msgtext, sender, sessionIds, userCoversationArr) {

    logger.debug("api ai start");

    var payloadIntent = '';
    var response = '';
    var strIntent = '';
    var actionname = '';
    var result = '';

    try {

        logger.debug("apiai Call text " + msgtext);
        logger.debug("apiai sender ID " + sender);

        if (msgtext.indexOf('|Payload:recorddetails|') > -1) {

           // logger.debug('inside payload intent with record details');

            userCoversationArr.apireqdatetime = getDateTime();

            var formattedResponse = NLPresponseFormatter("custom", msgtext);

            //logger.debug('payloadmessage::::' + JSONbig.stringify(formattedResponse));

            strIntent = formattedResponse.formattedResponse.parameters.Intent;

            //logger.debug('insidepayloadstrIntent::::' + JSONbig.stringify(strIntent));

            response = result;
            actionname = strIntent;

            userCoversationArr.action = actionname;
            userCoversationArr.intent = actionname;
            userCoversationArr.apiresdatetime = getDateTime();
            userCoversationArr.apiTimeTaken = getsecondstaken('apiai', userCoversationArr.apireqdatetime, userCoversationArr.apiresdatetime);
            userCoversationArr.apiaireq = 'passed';
            printChatHistory(userCoversationArr);

            Findswitchcase(formattedResponse, actionname, strIntent, sender, userCoversationArr, "");



        }
        else if (msgtext.indexOf('|Payload|') > -1) {

            //logger.debug('inside payload intent with other payloads');

            userCoversationArr.apireqdatetime = getDateTime();

            var formattedResponse = NLPresponseFormatter("custom", msgtext);
            //logger.debug('payloadmessage::::' + JSONbig.stringify(formattedResponse));

            strIntent = formattedResponse.formattedResponse.parameters.Intent;

            //logger.debug('insidepayloadstrIntent::::' + JSONbig.stringify(strIntent));

            response = result;
            actionname = strIntent;

            userCoversationArr.action = actionname;
            userCoversationArr.intent = actionname;
            userCoversationArr.apiresdatetime = getDateTime();
            userCoversationArr.apiTimeTaken = getsecondstaken('apiai', userCoversationArr.apireqdatetime, userCoversationArr.apiresdatetime);
            userCoversationArr.apiaireq = 'passed';
            printChatHistory(userCoversationArr);


            Findswitchcase(formattedResponse, actionname, strIntent, sender, userCoversationArr, "");
        }
        else {

            logger.debug('Getting ready to send information to api.ai');

            userCoversationArr.apireqdatetime = getDateTime();

            var apiaiRequest = apiAiService.textProxyRequest(msgtext, { sessionId: sessionIds.get(sender) });

            apiaiRequest.on('response', function (response) {

                if (isDefined(response.result)) {
					
					logger.debug("Api.Ai Full Response " + JSON.stringify(response));

                    var responseText = response.result.fulfillment.speech;
                    var responseData = response.result.fulfillment.data;
                    var action = response.result.action;

                    var intent = response.result.metadata.intentName;
                    var Finished_Status = response.result.actionIncomplete;

                    //logger.debug("Finished_Status " + Finished_Status);
                    logger.debug('responseText  : - ' + responseText);
                    //logger.debug('responseData  : - ' + responseData);
                    logger.debug('action : - ' + action);
                    logger.debug('intent : - ' + intent);

                    var logdatetime = getDateTime();

                    userCoversationArr.action = action;
                    userCoversationArr.intent = intent;

                    userCoversationArr.apiresdatetime = getDateTime();
                    userCoversationArr.apiTimeTaken = getsecondstaken('apiai', userCoversationArr.apireqdatetime, userCoversationArr.apiresdatetime);
                    userCoversationArr.apiaireq = 'passed';
                    printChatHistory(userCoversationArr);

                    var strNLP = config.NLP;

                    var formattedResponse = NLPresponseFormatter(strNLP, response);

                    // see if the intent is not finished play the prompt of API.ai or fall back messages
                    if (Finished_Status == true || intent == "Default Fallback Intent") {
                        sendFBMessage(sender, { text: responseText }, userCoversationArr);
                    }
                    else //if the intent is complete do action
                    {
                        logger.debug("----->>>>>>>>>>>> INTENT SELECTION <<<<<<<<<<<------");

                        // Methods to be called based on action
                        //Findswitchcase(response, action, intent, sender, userCoversationArr, "");

                        Findswitchcase(formattedResponse, action, intent, sender, userCoversationArr, responseText);
                    }
                }
            });

            apiaiRequest.on('error', function (error) {
                logger.debug("Error on sending request to api.ai " + error)
                userCoversationArr.apiaireq = 'error';
                printChatHistory(userCoversationArr);

            });


            apiaiRequest.end2();

        }
    }
    catch (apiaierror) {
        logger.error("apiai Error in sending message to apiai " + apiaierror)
    }

    logger.debug("apiai end");
}

function NLPresponseFormatter(NLP, response) {
    var formattedResponse = {};
    if (NLP == "apiai") {
        //convert api resp to below format
        formattedResponse = { "formattedResponse": { "parameters": response.result.parameters } };
    }
    else if (NLP == "watson") {
        //convert Watson  resp to below format
        formattedResponse = { "formattedResponse": { "parameters": { "Channel": "HBO", "ChannelGenre": "", "date": "", "Genre": "", "Programs": "" } } };
    }
    else if (NLP == "custom") { //payload concept

        //convert payload resp to below format

        //logger.debug("custom payload conversion" + response);

        var result = { parameters: {} };
        {
            response.split('|').forEach(function (x) {
                var arr = x.split(':');
                arr[1] && (result.parameters[arr[0]] = arr[1]);
                arr[1] && ("{" + arr[0].trim() + ":" + arr[1].trim() + "}");
            });

          //  logger.debug('strPayloadresult : ' + JSONbig.stringify(result));
        }

        formattedResponse = { "formattedResponse": result };
    }

    return formattedResponse;
}

function FindPayLoadIntent(payloaddata) {
    logger.debug('insidepayloaddata');
    try {
        var resultnew = "{\"entities\":[";
        var resultJSON;
        var result = { entities: {} };
        {
            payloaddata.split('|').forEach(function (x) {
                var arr = x.split(':');
                arr[1] && (result.entities[arr[0]] = arr[1]);
                arr[1] && (resultnew = resultnew + "{\"entity\":" + "\"" + arr[0].trim() + "\",\"value\":" + "\"" + arr[1].trim() + "\"},");
            });
            //logger.debug('strPayloadresult : ' + JSONbig.stringify(result));
            var strpaylodIntent = result.entities.Intent;
            //logger.debug('payloadIntent : ' + JSONbig.stringify(strpaylodIntent));
        }
        resultnew = resultnew.substring(0, resultnew.length - 1);
        resultnew = resultnew + ']}'

        //logger.debug('resultnew : ' + resultnew);
        var resultJSON = JSON.parse(resultnew);
      //  logger.debug("resultJSON : " + JSONbig.stringify(resultJSON));

    }
    catch (err) {
        logger.debug("Exception while payload separation : " + err);
    }
    logger.debug('exit insidepayloaddata');
    return resultJSON;
}

function getEntity(entitycoll, entityValue) {
    //logger.debug(entityValue);
    var i = null;
    logger.debug("arr length" + entitycoll.length);
    for (i = 0; entitycoll.length > i; i += 1) {
        logger.debug("entitycoll[i] : " + entitycoll[i].value)
        if (entitycoll[i].entity === entityValue) {

            logger.debug(entityValue + " : " + entitycoll[i].value);
            return entitycoll[i].value;

        }
    }
    return '';
}

function Findswitchcase(response, responseText, strIntent, sender, userCoversationArr, apiairesp) {

    logger.debug("----->>>>>>>>>>>> INTENT SELECTION <<<<<<<<<<<------");
    //logger.debug("Findswitchcase payload " + JSONbig.stringify(response));
    //logger.debug("Findswitchcase apiairesp " + JSONbig.stringify(apiairesp));

    //logger.debug("Selected_action : " + responseText);
    // Methods to be called based on action 
    switch (responseText) {
        case "getStarted":
            logger.debug("----->>>>>>>>>>>> INSIDE getStarted <<<<<<<<<<<------");
            //welcomeMsg(sender);
            logger.debug("Sender ID " + sender);
            var senderArr = { senderParam: sender };
            userCoversationArr.ufdreqdatetime = getDateTime();
            GetAuthProfile(senderArr, userCoversationArr, function (str) { GetAuthMessageCallback(str, senderArr, userCoversationArr) });
            /*
            var respobj =
                {
                    "facebook":
                    {
                        "attachment":
                        {
                            "type": "template",
                            "payload":
                            {
                                "template_type": "button",
                                "text": "Welcome to Verizon",
                                "buttons":
                                [
                                    {
                                        "type": "postback",
                                        "title": "Entertainment Bot",
                                        "payload": "Chat with Bot"
                                    },
                                    {
                                        "type": "postback",
                                        "title": "Chat With Agent",
                                        "payload": "support"
                                    }
                                ]
                            }
                        }
                    }
                };


            sendFBMessage(sender, respobj.facebook, userCoversationArr);
            */
            break;
        case "chatwithbot":
            logger.debug("----->>>>>>>>>>>> INSIDE chatwithbot <<<<<<<<<<<------");
            var senderArr = { senderParam: sender };
            userCoversationArr.ufdreqdatetime = getDateTime();
            GetAuthProfile(senderArr, userCoversationArr, function (str) { GetAuthMessageCallback(str, senderArr, userCoversationArr) });
            break;
        case "LinkOptions":
            logger.debug("----->>>>>>>>>>>> INSIDE LinkOptions <<<<<<<<<<<------");
            logger.debug("Sender ID " + sender);
            var senderArr = { senderParam: sender };
            userCoversationArr.ufdreqdatetime = getDateTime();
            GetAuthProfile(senderArr, userCoversationArr, function (str) { GetAuthProfileCallback(str, senderArr, userCoversationArr) });
            break;
        case "MoreOptions":
            logger.debug("----->>>>>>>>>>>> INSIDE MoreOptions <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = '';
            userCoversationArr.ufdresdatetime = ''
            userCoversationArr.ufdTimeTaken = ''
            userCoversationArr.ufdreq = 'NA'
			staticMessages("MOREOPTIONS", userCoversationArr, function (str) { staticMessagesCallback(str, sender, userCoversationArr) });
           // sendFBMessage(sender, { text: apiairesp }, userCoversationArr);
            break;
        case "MainMenu":
            logger.debug("----->>>>>>>>>>>> INSIDE MainMenu <<<<<<<<<<<------");
            MainMenu(sender, userCoversationArr);
            break;
        case "record":
            logger.debug("----->>>>>>>>>>>> INSIDE recordnew <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            RecordScenario(response, sender, userCoversationArr);
            break;
        case " record":
            logger.debug("----->>>>>>>>>>>> INSIDE recordnew <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            RecordScenario(response, sender, userCoversationArr);
            break;
        case "CategoryList":

            logger.debug("----->>>>>>>>>>>> INSIDE CategoryList <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = '';
            userCoversationArr.ufdresdatetime = ''
            userCoversationArr.ufdTimeTaken = ''
            userCoversationArr.ufdreq = 'NA'
            CategoryList(response, sender, userCoversationArr);
            break;
        case "pkgSearch":
            logger.debug("----->>>>>>>>>>>> INSIDE Package search <<<<<<<<<<<------");
            /*var strChannelName = response.result.parameters.Channel.toUpperCase();
            var strGenre = response.result.parameters.ChannelGenre.toUpperCase();*/
            var strChannelName = response.formattedResponse.parameters.Channel.toUpperCase();
            var strGenre = response.formattedResponse.parameters.ChannelGenre.toUpperCase();
            logger.debug(" Channel Name " + strChannelName);
            logger.debug(" Genre " + strGenre);
            logger.debug(" Sender ID " + sender);

            var ChnArr = { channalName: strChannelName, senderParam: sender, regionParam: "", vhoidParam: "", cktidParam: "", Genre: strGenre };

            userCoversationArr.ufdreqdatetime = getDateTime();
            packageChannelSearch(sender, ChnArr, userCoversationArr, function (str) { packageChannelSearchCallback(str, ChnArr, userCoversationArr) });
            break;
        case "recommendation":
            logger.debug("----->>>>>>>>>>>> INSIDE recommendation <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            recommendations(response, 'OnLater', sender, userCoversationArr, function (str) { recommendationsCallback(str, sender, userCoversationArr) });
            break;
        case "OnNowrecommendation":
            logger.debug("----->>>>>>>>>>>> INSIDE OnNowrecommendation <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            recommendations(response, 'OnNow', sender, userCoversationArr, function (str) { recommendationsCallback(str, sender, userCoversationArr) });
            break;
        case "channelsearch":
            logger.debug("----->>>>>>>>>>>> INSIDE channelsearch <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            stationsearch(response, userCoversationArr, function (str) { stationsearchCallback(str, sender, userCoversationArr) });
            break;
        case "programSearch":
            logger.debug("----->>>>>>>>>>>> INSIDE programSearch <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            PgmSearch(response, sender, userCoversationArr, function (str) { PgmSearchCallback(str, response, sender, userCoversationArr) });
            break;
        case "DSprogramSearch":
            logger.debug("----->>>>>>>>>>>> INSIDE DSprogramSearch <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            DSPgmSearch(response, sender, userCoversationArr, function (str) { PgmSearchCallback(str, response, sender, userCoversationArr) });
            break;
		case "DSprogramSearchWithTime":
            logger.debug("----->>>>>>>>>>>> INSIDE DSprogramSearchWithTime <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            DSPgmSearchWithTime(response, sender, userCoversationArr, function (str) { PgmSearchCallback(str, response, sender, userCoversationArr) });
            break;

        case "DSEpisodeDetails":
        case "showEpisode":
            logger.debug("----->>>>>>>>>>>> INSIDE DSEpisodeDetails <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            DSEpisodeDetails(response, sender, userCoversationArr, function (str) { PgmSearchCallback(str, response, sender, userCoversationArr) });
            break;
        case "DSShowSchedule":
            logger.debug("----->>>>>>>>>>>> INSIDE DSEpisodeDetails <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            DSShowSchedule(response, sender, userCoversationArr, function (str) { PgmSearchCallback(str, response, sender, userCoversationArr) });
            break;
        case "support":
            logger.debug("----->>>>>>>>>>>> INSIDE support <<<<<<<<<<<------");
            support(sender, userCoversationArr);
            /*
                var inputstr = "<sprinkler>true</sprinkler>";
                updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest1");
            */
            break;
        case "upgradeDVR":
            logger.debug("----->>>>>>>>>>>> INSIDE upgradeDVR <<<<<<<<<<<------");
            support(sender, userCoversationArr);
            //upgradeDVR(response, sender, userCoversationArr);

			/*var inputstr = "<sprinkler>true</sprinkler>"
            async.series({
                one: function (callback) {
                    var xVal = updateAndGetSession(sender, inputstr, "", "BotRequest1", function (data) {

                        callback(null, data);

                        logger.debug('CallBack processevent add sprinkler flag to true from updateAndGetSession_1');
                    });
                }
            }, function (err, results) {
                logger.debug('Made sprinkler as true');
                //sendFBMessage(sender, { text: "Agent will be with you shortly" }, userCoversationArr);
            });*/

            break;
        case "upsell":
            logger.debug("----->>>>>>>>>>>> INSIDE upsell <<<<<<<<<<<------");
            support(sender, userCoversationArr);
            //upsell(response, sender, userCoversationArr);
            /*var inputstr = "<sprinkler>true</sprinkler>"
            async.series({
                one: function (callback) {
                    var xVal = updateAndGetSession(sender, inputstr, "", "BotRequest1", function (data) {

                        callback(null, data);

                        logger.debug('CallBack processevent add sprinkler flag to true from updateAndGetSession_1');
                    });
                }
            }, function (err, results) {
                logger.debug('Made sprinkler as true');
                //sendFBMessage(sender, { text: "Agent will be with you shortly" }, userCoversationArr);
            });*/
            break;
        case "Billing":
        case "cancelappointmentnotconfirmed":
        case "Rescheduleticket":
        case "showopentickets":
        case "showOutagetickets":
            logger.debug("----->>>>>>>>>>>> INSIDE Billing/Ticktes etc <<<<<<<<<<<------");
            support(sender, userCoversationArr);
            /*var inputstr = "<sprinkler>true</sprinkler>"
            async.series({
                one: function (callback) {
                    var xVal = updateAndGetSession(sender, inputstr, "", "BotRequest1", function (data) {

                        callback(null, data);

                        logger.debug('CallBack processevent add sprinkler flag to true from updateAndGetSession_1');
                    });
                }
            }, function (err, results) {
                logger.debug('Made sprinkler as true');
                //sendFBMessage(sender, { text: "Agent will be with you shortly" }, userCoversationArr);
            }); */
            /*userCoversationArr.ufdreqdatetime = getDateTime();
            showBillInfo(response, sender, userCoversationArr, function (str) { showBillInfoCallback(str, sender, userCoversationArr) });*/
            break;
        /*case "cancelappointmentnotconfirmed":
            logger.debug("----->>>>>>>>>>>> INSIDE cancelappointment <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            cancelscheduledticket(response, sender, userCoversationArr, function (str) { cancelscheduledticketCallBack(str, sender, userCoversationArr) });
            break;
        case "Rescheduleticket":
            logger.debug("----->>>>>>>>>>>> INSIDE Rescheduleticket <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            Rescheduleticket(response, sender, userCoversationArr, function (str) { RescheduleticketCallback(str, sender, userCoversationArr) });
            break;
        case "showopentickets":
            logger.debug("----->>>>>>>>>>>> INSIDE showopentickets <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            showopentickets(response, sender, userCoversationArr, function (str) { showopenticketsCallback(str, sender, userCoversationArr) });
            break;
        case "showOutagetickets":
            logger.debug("----->>>>>>>>>>>> INSIDE showOutagetickets <<<<<<<<<<<------");
            userCoversationArr.ufdreqdatetime = getDateTime();
            showOutagetickets(response, sender, userCoversationArr, function (str) { showOutageticketsCallback(str, sender, userCoversationArr) });
            break;
        case "programSearchVOD":
             logger.debug("----->>>>>>>>>>>> INSIDE programSearch <<<<<<<<<<<------");
             userCoversationArr.ufdreqdatetime = getDateTime();
             PgmSearch(response, sender, userCoversationArr,function (str) { PgmSearchCallback(str,response, sender, userCoversationArr) });
              break;
        case "vodsearch":
             logger.debug("----->>>>>>>>>>>> INSIDE vodsearch<<<<<<<<<<<------");
             userCoversationArr.ufdreqdatetime = getDateTime();
             VODSearch(response,sender, userCoversationArr,function (str) { VODSearchCallback(str,sender, userCoversationArr) });
             break;
        case "vodpricelist":
             logger.debug("----->>>>>>>>>>>> INSIDE vodpricelist<<<<<<<<<<<------");
              userCoversationArr.ufdreqdatetime = getDateTime();
              VODPriceList(response,sender, userCoversationArr,function (str) { VODPriceListCallback(str,sender, userCoversationArr) });
             break;
         case "vodpurchase":
             logger.debug("----->>>>>>>>>>>> INSIDE vodpurchase<<<<<<<<<<<------");
             userCoversationArr.ufdreqdatetime = getDateTime();
             VODPurchase(response,sender, userCoversationArr,function (str) { VODPurchaseCallback(str,sender, userCoversationArr) });
             break; */
        default:
            logger.debug("----->>>>>>>>>>>> INSIDE default <<<<<<<<<<<------");

            userCoversationArr.ufdreqdatetime = '';
            userCoversationArr.ufdresdatetime = ''
            userCoversationArr.ufdTimeTaken = ''
            userCoversationArr.ufdreq = 'NA'

            if ((apiairesp == undefined) || (apiairesp == '')) 
				//sendFBMessage(sender, commonMessage.facebook , userCoversationArr);
				staticMessages("COMMONERROR", userCoversationArr, function (str) { staticMessagesCallback(str, sender, userCoversationArr) });
            
			break;
    }
}

function sendFBMessage(sender, messageData, userCoversationArr) {
	
	 logger.debug("start sendFBMessage");

    try {
        request({
            url: 'https://graph.facebook.com/v2.8/me/messages',
            proxy: config.vz_proxy,
            qs: { access_token: FB_PAGE_ACCESS_TOKEN },
            method: 'POST',
            json: {
                recipient: { id: sender },
                message: messageData
            }
        }, function (error, response, body) {

            var logdatetime = getDateTime();
            userCoversationArr.botresponsedatetime = logdatetime;

            if (error) {

                logger.debug('Error sending FB message: ', error);
                userCoversationArr.senttofb = 'error';
                userCoversationArr.botresponse = "Error sending FB Message" + error;

            } else if (response.body.error) {
                logger.debug('Error sending FB message: ', response.body.error);
                userCoversationArr.senttofb = 'error';
                userCoversationArr.botresponse = "Error sending FB Message" + response.body.error;

            } else if (!error && response.statusCode == 200) {

                logger.debug('Sucessfully sent to faceboook');
                logger.debug("Response Headers " + JSON.stringify(response.headers));
                userCoversationArr.senttofb = 'passed';
                if (messageData.text) {
                    userCoversationArr.botresponse = messageData.text;
                }
                else if (messageData.attachment) {
                    if (messageData.attachment.payload) {
                        if (messageData.attachment.payload.text) {
                 //           logger.debug("Attachment Payload Text " + messageData.attachment.payload.text);
                            userCoversationArr.botresponse = messageData.attachment.payload.text + " With Options";
                        }
                        else {
                            userCoversationArr.botresponse = "Bot responded back with carousels without text";
                        }
                    }
                }
                else if (messageData.attachments) {
                    if (messageData.attachments.payload) {
                        if (messageData.attachments.payload.text) {
                   //         logger.debug("Attachment Payload Text " + messageData.attachments.payload.text);
                            userCoversationArr.botresponse = messageData.attachments.payload.text + " With Options";
                        }
                        else {
                            userCoversationArr.botresponse = "Bot responded back with carousels without text";
                        }
                    }
                }
                else
                    userCoversationArr.botresponse = JSON.stringify(messageData);
            }

            // Print the chat history
            userCoversationArr.botresponsetime = getsecondstaken('finalbotresponse', userCoversationArr.UserRequestDate, userCoversationArr.botresponsedatetime);
            printChatHistory(userCoversationArr);
			logger.debug("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< END OF MESSAGE REQUEST >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
																		
        });

    }
    catch (sendfberr) {
        logger.debug("Erro while sending the FB message for interaction id " + userCoversationArr.interactionid + " error " + sendfberr);
    }
}

function doSubscribeRequest() {
    request({
        method: 'POST',
        uri: "https://graph.facebook.com/v2.8/me/subscribed_apps?access_token=" + FB_PAGE_ACCESS_TOKEN,
        proxy: config.vz_proxy
    },
        function (error, response, body) {
            if (error) {
                logger.debug('Error while subscription: ', error);
            } else {
                logger.debug('Subscription result: ', response.body);
            }
        });
}

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

function getDateTime() {

    var date = new Date();

    var hour = date.getUTCHours();
    hour = (hour < 10 ? "0" : "") + hour;

    var min = date.getUTCMinutes();
    min = (min < 10 ? "0" : "") + min;

    var sec = date.getUTCSeconds();
    sec = (sec < 10 ? "0" : "") + sec;

    var msec = date.getUTCMilliseconds();
    msec = (msec < 10 ? "0" : "") + msec;

    var year = date.getUTCFullYear();

    var month = date.getUTCMonth() + 1;
    month = (month < 10 ? "0" : "") + month;

    var day = date.getUTCDate();
    day = (day < 10 ? "0" : "") + day;

    return month + "/" + day + "/" + year + " " + hour + ":" + min + ":" + sec + ":" + msec;

}

function getsecondstaken(whatreq, fromdate, todate) {
    var retsecondsTook;
    try {
        var reqDate = new Date(fromdate);
        var resDate = new Date(todate);

        var differenceTravel = resDate.getTime() - reqDate.getTime();

        retsecondsTook = Math.floor((differenceTravel) / (1000));

        logger.debug("Total seconds Taken for " + whatreq + " is " + retsecondsTook);

        retsecondsTook = retsecondsTook.toString();
    }
    catch (dateDiffexp) {
        logger.debug("Exception while getting the time taken between two dates : " + dateDiffexp)
    }

    return retsecondsTook;
}

function printChatHistory(userCoversationArr) {
    userCoversationArr.printDateTime = getDateTime();
    ChatHistoryLog.info("|" + userCoversationArr.printDateTime + "|" + userCoversationArr.UserRequestDate + "|" + userCoversationArr.interactionid + "|" + userCoversationArr.senderid + "|" + userCoversationArr.receipentid + "|" + userCoversationArr.timestamp + "| " + userCoversationArr.messageid + "|" + userCoversationArr.CXquestion + "|" + userCoversationArr.userreq + "|" + userCoversationArr.apireqdatetime + "|" + userCoversationArr.action + "|" + userCoversationArr.intent + "|" + userCoversationArr.apiresdatetime + "|" + userCoversationArr.apiTimeTaken + "|" + userCoversationArr.apiaireq + "|" + userCoversationArr.ufdreqdatetime + "|" + userCoversationArr.ufdresdatetime + "|" + userCoversationArr.ufdTimeTaken + "|" + userCoversationArr.ufdreq + "|" + userCoversationArr.botresponsedatetime + "|" + userCoversationArr.botresponse + "|" + userCoversationArr.senttofb + "|" + userCoversationArr.botresponsetime + "|" + userCoversationArr.isrecorded);
}

function sendNotification(isError, isrecording, methodName, errorMessage, stackTrace, innerException, senderID, messageID, intent, action, botResponse, callback) {
    logger.debug("Sending failure notification" + senderID);

    var content;
    if (isrecording)
        content = 'Recording Failure Notification:' + '<br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Facebook User: </b> profile.first_name  profile.last_name </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Sender ID: </b>  ' + senderID + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Method Name: </b>  ' + methodName + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Intent: </b> <br /> ' + intent + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Action: </b> <br /> ' + action + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Error Message: </b> <br /> ' + botResponse + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Payload Information: </b> <br /> ' + errorMessage + ' </td></tr>';
    else if (isError)
        content = 'Failure Notification:' + '<br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Facebook User: </b> profile.first_name  profile.last_name </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Sender ID: </b>  ' + senderID + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Method Name: </b>  ' + methodName + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Error Message: </b> <br /> ' + errorMessage + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Stack Trace: </b> <br /> ' + stackTrace + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Inner Exception: </b> <br /> ' + innerException + ' </td></tr> <b> Actual Error: </b> <br /> ' + botResponse + ' </td></tr>';
    else
        content = 'Intent Failure:' + '<br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Facebook User: </b> profile.first_name profile.last_name </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Sender ID: </b>  ' + senderID + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Message ID: </b> <br /> ' + messageID + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Intent: </b> <br /> ' + intent + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Action: </b> <br /> ' + action + ' </td></tr> <br /> <br /> <tr style=margin: 0; padding: 0; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px;/> <td style=margin: 0; padding: 0 0 20px; font-family: Helvetica Neue, Helvetica, Helvetica, Arial, sans-serif; box-sizing: border-box; font-size: 14px; vertical-align: top;/> <b> Bot Response: </b> <br /> ' + botResponse + ' </td></tr>';

    getFBProfile(senderID, content, callback);
}

function getFBProfile(senderID, content, callback) {
    //logger.debug("Invoking Facebook service to get profile information");

    /*request("https://graph.facebook.com/v2.6/" + senderID + "?access_token=" + config.FBPAGEACCESSTOKEN, function (error, response, body) {

        try {
            logger.debug("Received Profile Info from Facebook  : " + body);
            var profile = JSON.parse(body);
            callback(content, profile);
        }
        catch (ex) {
            logger.debug("getFBProfile Error Exception : " + ex);
        }

    }, function (error, response, body) {
        if (error) {
            logger.debug('Error fetching FB profile info: ', error);
        } else if (response.body.error) {
            logger.debug('Error fetching FB profile info: ', response.body.error);
        }
    }
    ); */

    request({
        url: 'https://graph.facebook.com/v2.8/' + senderID + '?fields=first_name,last_name',
        proxy: config.vz_proxy,
        qs: { access_token: FB_PAGE_ACCESS_TOKEN },
        method: 'GET'
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var profile = JSON.parse(body);
            //callback(content, profile);

            if (profile != null && profile != 'undefined') {
                //logger.debug("FB First Name " + profile.first_name);

                if (profile.first_name != null && profile.first_name != 'undefined') {
                    content = content.replace('profile.first_name', profile.first_name);
                }

                if (profile.last_name != null && profile.last_name != 'undefined') {
                    content = content.replace('profile.last_name', profile.last_name);
                }

            }

            sendmail({
                from: config.EMail_From,
                to: config.EMail_To,
                replyTo: config.EMail_To,
                subject: config.subject,
                html: content
            }, function (err, reply) {
                if (err) {
                    logger.debug('EMail Communication Failure -  Error : ' + err + ' ; StackTrace : ' + err.stack);
                } else {
                    logger.debug('EMail sent successfully : ' + reply);
                };
            })

        } else {
            // TODO: Handle errors
            logger.debug("Get FB user profile failed");
        }
    });
}

function sendEMail(content, profile) {

    logger.debug("Sending EMail Started");

    //content = content.replace('profile.first_name', profile.first_name).replace('profile.last_name', profile.last_name);

    if (profile != null && profile != 'undefined') {
        //logger.debug("FB First Name " + profile.first_name);

        if (profile.first_name != null && profile.first_name != 'undefined') {
            content = content.replace('profile.first_name', profile.first_name);
        }

        if (profile.last_name != null && profile.last_name != 'undefined') {
            content = content.replace('profile.last_name', profile.last_name);
        }

    }

    sendmail({
        from: config.EMail_From,
        to: config.EMail_To,
        replyTo: config.EMail_To,
        subject: 'Veraa BOT - Failure Notification',
        html: content
    }, function (err, reply) {
        if (err) {
            logger.debug('EMail Communication Failure -  Error : ' + err + ' ; StackTrace : ' + err.stack);
        } else {
            logger.debug('EMail sent successfully : ' + reply);
        };
    })
}

function displayProgIndicator(isEnabled, SenderID) {

    logger.debug("inside displayProgIndicator " + config.Facebook_SenderID);

    //var accessToken = "EAAIOcT9EwQ8BABzv7NIGU9Dt1re0fXB4uZAxLtrv0hxfDDULgo3J0oZA3x3kZC0TsWwYMsjdgIYnGIviZBVM2asPvEgQW8vSH5mCxrzTFr9GmncTLQUOLb9HgPbZCj67jEgvMAFsdMBLrHABeHieQyXU2RFhg62SYhZCEMl1xpDQZDZD";

    var headersInfo = {
        "Content-Type": "application/json"
    };

    var args = {
        "recipient": {
            "id": SenderID
        },
        "sender_action": isEnabled ? "typing_on" : "typing_off"
    }

    logger.debug("args " + JSON.stringify(args));

    request.post({
        url: "https://graph.facebook.com/v2.6/me/messages?access_token=" + FB_PAGE_ACCESS_TOKEN,
        proxy: config.vz_proxy,
        headers: headersInfo,
        method: 'POST',
        json: args
    },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
          //      logger.debug("displayProgIndicator body " + JSON.stringify(body));
            }
            else {
                logger.debug('displayProgIndicator error: ' + error + ' body: ' + JSON.stringify(body));
            }
        }
    );
}

function getTagValue(tagName, sessionStr) {

    logger.debug('Inside getTagValue');

    var fResStr = "";

    if (sessionStr.search("&lt;" + tagName) > 0) {
        fResStr = sessionStr.substring(sessionStr.search("&lt;" + tagName) + tagName.length + 8, sessionStr.search('/' + tagName) - 4);
        fResStr = fResStr.split("&lt;").join('<');
        fResStr = fResStr.split("&gt;").join('>');

    }

    logger.debug("getTagValue for tag " + tagName + "= " + fResStr);
    logger.debug('Exit getTagValue');
    return fResStr;
}

function updateAndGetSession_1(senderId, inpurStr, resTag, reqTag) {

    logger.debug('Inside updateAndGetSession - old');

    var sessionStartTime = getDateTime();
    var sessionEndTime;
    var sessionTimeTaken;

    try {

        var xml = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:urn=\"urn:botprocessor.webservice.interfaces.ppsh.verizon.com\"> <soapenv:Header/> <soapenv:Body> <urn:getPPSHData> <msg> <![CDATA[ <" + reqTag + "><messaging><sender><id>" + senderId + "</id> </sender> <message>" + inpurStr + "</message> </messaging> </" + reqTag + ">]]> </msg> </urn:getPPSHData> </soapenv:Body> </soapenv:Envelope>";


        //logger.debug('updateAndGetSession senderid ' + senderId);

        if (resTag != "")
            logger.debug('Retrieve the value for old' + resTag + ' from session');

        if (inpurStr != "")
            logger.debug('Data Added or Updated into Session old ' + inpurStr);

        xhr.open('POST', config.Session_URL, false);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        //xhr.setRequestHeader('Content-Length', xml.length);
        xhr.setRequestHeader('SOAPAction', '');
        xhr.send(xml);

        //logger.debug('STATUS: ' + xhr.status + 'RESP: ' + xhr.responseText);

        if (resTag.length > 1) {

            var result = getTagValue(resTag, xhr.responseText);
            logger.debug(resTag + ":" + result);

            sessionEndTime = getDateTime();
            sessionTimeTaken = getsecondstaken('session', sessionStartTime, sessionEndTime);
            logger.debug("Total Time taken to retrieve from session old " + sessionTimeTaken + " seconds");
            logger.debug('Exit updateAndGetSession after retrieving value old');

            return result;
        }
    }
    catch (err) {
        logger.debug("Error in updateAndGetSession old " + err);
    }

    sessionEndTime = getDateTime();
    sessionTimeTaken = getsecondstaken('session', sessionStartTime, sessionEndTime);
    logger.debug("Total Time taken to retrieve from session old " + sessionTimeTaken + " seconds");

    logger.debug('Exit updateAndGetSession old');
}

function updateAndGetSession(senderId, inpurStr, resTag, reqTag, cbFunc) {

    logger.debug('Inside updateAndGetSession - new');
    var result;
    //var sessionStartTime = getDateTime();
    //var sessionEndTime;
    //var sessionTimeTaken;

    try {

        var xml = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:urn=\"urn:botprocessor.webservice.interfaces.ppsh.verizon.com\"> <soapenv:Header/> <soapenv:Body> <urn:getPPSHData> <msg> <![CDATA[ <" + reqTag + "><messaging><sender><id>" + senderId + "</id> </sender> <message>" + inpurStr + "</message> </messaging> </" + reqTag + ">]]> </msg> </urn:getPPSHData> </soapenv:Body> </soapenv:Envelope>";

        if (resTag != "")
            logger.debug('Retrieve the value for new ' + resTag + ' from session');

        if (inpurStr != "")
            logger.debug('Data Added or Updated into Session new ' + inpurStr);

        var sampleHeadersInfo = {
            "Content-Type": "application/json", "SOAPAction": ""
        };
        request({
            url: config.Session_URL,
            headers: sampleHeadersInfo,
            method: 'POST',
            body: xml
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("Before Parse " + sessionTimeTaken + " seconds - new");
                if (resTag.length > 1) {

                    result = getTagValue(resTag, body);
                }
                if (cbFunc != null) {
                    cbFunc(result);
                }
                logger.debug(resTag + ":" + result);
                //sessionEndTime = getDateTime();
                //sessionTimeTaken = getsecondstaken('session', sessionStartTime, sessionEndTime);
                //logger.debug("Total Time taken to retrieve from session " + sessionTimeTaken + " seconds - new");
                logger.debug('Exit updateAndGetSession_1 after retrieving value - new');
            }
            else {
                //logger.debug('new -0 error on updateAndGetSession_1 ' + error + ' body: ' + JSON.stringify(body) + ' response status code ' + response.statusCode);
            }
        });
    }
    catch (err) {
        logger.debug("Error in updateAndGetSession - new " + err);
    }
    //sessionEndTime = getDateTime();
    //sessionTimeTaken = getsecondstaken('session', sessionStartTime, sessionEndTime);
    //logger.debug("Total Time taken to retrieve from session " + sessionTimeTaken + " seconds - new");
    logger.debug('Exit updateAndGetSession - new');
}

function commonError(userCoversationArr, erroron) {
    //var returntext = "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?";

    if (erroron == 'ufdreq') {

        userCoversationArr.ufdresdatetime = '';
        userCoversationArr.ufdreqdatetime = '';
        userCoversationArr.ufdTimeTaken = '';
        userCoversationArr.ufdreq = 'error';
    }
    else if (erroron == 'ufdres') {

        userCoversationArr.ufdresdatetime = getDateTime();
        userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
        userCoversationArr.ufdreq = 'error';
    }

    printChatHistory(userCoversationArr);
    sendFBMessage(userCoversationArr.senderid, commonMessage.facebook, userCoversationArr);
}

// Functionality related call(s):

function staticMessages(MsgName, userCoversationArr, callback) {

    logger.debug('Inside staticMessages started');
    try {

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'BotStaticMessages',
                    BotstrTitleValue: MsgName
                }
            }
        };

        logger.debug("json " + String(args));

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on sending request to staticMessages: ' + error + ' body: ' + body);
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  staticMessages detail : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug('Inside staticMessages completed');
}

function staticMessagesCallback(apiresp, senderid, userCoversationArr) {
    var objToJson = {};
    objToJson = apiresp;
    try {

        logger.debug("Response from staticMessagesCallback " + JSON.stringify(objToJson));

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {


            var respobj = objToJson[0].Inputs.newTemp.Section.Inputs.Response;


            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            if (respobj != null && respobj.facebook != null && respobj.facebook.attachment != null) {
                //fix to single element array 
                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.elements != null) {
                    try {
                        var chanls = respobj.facebook.attachment.payload.elements;

                        if (!util.isArray(chanls)) {
                            respobj.facebook.attachment.payload.elements = [];
                            respobj.facebook.attachment.payload.elements.push(chanls);
                        }
                    } catch (err) { logger.debug('error on array list ' + err); }
                }


                //to fix one button issue in button template
                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.buttons != null) {

                    try {

                        var elementsButton = respobj.facebook.attachment.payload.buttons;

                        if (!util.isArray(elementsButton)) {
                            respobj.facebook.attachment.payload.buttons = [];
                            respobj.facebook.attachment.payload.buttons.push(elementsButton);
                        }
                    }
                    catch (err) {
                        logger.debug("Error for interactionID " + userCoversationArr.interactionid + " on static msg " + err); commonError(userCoversationArr, 'ufdres');
                    }
                }


                //to fix one button issue
                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.elements != null) {

                    try {

                        var objlength = respobj.facebook.attachment.payload.elements.length;

                        for (var i = 0; i < objlength; i++) {

                            var elementsButton = respobj.facebook.attachment.payload.elements[i].buttons;

                            if (!util.isArray(elementsButton)) {
                                respobj.facebook.attachment.payload.elements[i].buttons = [];
                                respobj.facebook.attachment.payload.elements[i].buttons.push(elementsButton);
                            }
                        }
                    }
                    catch (err) {
                        logger.debug("Error for interactionID " + userCoversationArr.interactionid + " on static msg " + err); commonError(userCoversationArr, 'ufdres');
                    }
                }


                if (respobj != null
                           && respobj.facebook != null
                           && respobj.facebook.attachment != null
                           && respobj.facebook.attachment.payload != null
                           && respobj.facebook.attachment.payload.text != null) {
                    var str = respobj.facebook.attachment.payload.text;
                    var respstr = str.replace(/<br>/gi, '\n');
                    respobj.facebook.attachment.payload.text = respstr;
                    logger.debug("Response from after br replace " + JSON.stringify(respobj.facebook));

                }
                sendFBMessage(senderid, respobj.facebook, userCoversationArr);

            }
            else if (respobj != null && respobj.facebook != null && respobj.facebook.quick_replies != null) {
                sendFBMessage(senderid, respobj.facebook, userCoversationArr);
            }
            else if (respobj != null && respobj.facebook != null && respobj.facebook.text != null) {
                var str = respobj.facebook.text;
                var respstr = str.replace(/<br>/gi, '\n');
                respobj.facebook.text = respstr;
                sendFBMessage(senderid, { text: respobj.facebook.text }, userCoversationArr);
            }

            else {
                logger.debug("staticMessages catchblock");
                sendFBMessage(senderid, {
                    text: "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?"

                }, userCoversationArr);
            }
        }
        else {
            logger.debug("No response from UFD api call for staticMessages  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');

        }
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on staticMessages detail : ' + experr);
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("staticMessagesCallback completed");
}


function welcomeMsg(senderid, userCoversationArr) {
    logger.debug("inside welcomeMsg");
    staticMessages("GETSTARTED", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });

 /*   sendFBMessage(senderid, { text: "Keep in mind, by continuing with this Fios experience, you understand that the information exchanged in Messenger will be visible by Facebook and used per their www.facebook.com/about/privacy. You also agree to the www.verizon.com/vzbot/verizonterms.html" }, userCoversationArr);

    var respobj =
        {
            "facebook":
            {
                "attachment":
                {
                    "type": "template",
                    "payload":
                    {
                        "template_type": "button",
                        "text": "Click Agree & Link Account to accept these terms. This way, I can start addressing your Fios entertainment questions and support concerns!\nDon't worry-your Verizon account information will not be shared with Facebook!",
                        "buttons":
                        [
                            {
                                "type": "postback",
                                "title": "Agree & Link Account",
                                "payload": "Link Account"
                            },
                            {
                                "type": "postback",
                                "title": "Maybe later",
                                "payload": "Main Menu"
                            },
                            {
                                "type": "postback",
                                "title": "Get Support",
                                "payload": "Support"
                            }
                        ]
                    }
                }
            }
        };


    sendFBMessage(senderid, respobj.facebook, userCoversationArr);*/

}

function MainMenu(senderid, userCoversationArr) {
    logger.debug("Main Menu")
    staticMessages("MAINMENU", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });

   /* var respobj =
        {
            "facebook":
            {
                "attachment":
                {
                    "type": "template",
                    "payload":
                    {
                        "template_type": "button",
                        "text": "Are you looking for something to watch, or do you want to see more options? Type or tap below.",
                        "buttons":
                        [
                            {
                                "type": "postback",
                                "title": "On Now",
                                "payload": "On Now"
                            },
                            {
                                "type": "postback",
                                "title": "On Later",
                                "payload": "On Later"
                            },
                            {
                                "type": "postback",
                                "title": "More Options",
                                "payload": "More Options"
                            }
                        ]
                    }
                }
            }
        };

    sendFBMessage(senderid, respobj.facebook, userCoversationArr);*/
}

function CategoryList(apireq, senderid, userCoversationArr) {
    logger.debug("Category list");
    staticMessages("CATEGORIES", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });

    /*var pgNo = apireq.formattedResponse.parameters.PageNo;
    var categlist = {}

    switch (pgNo) {
        case '1':
            categlist = {
                "facebook":
                {
                    "text": "Pick a category",
                    "quick_replies": [
                        { "content_type": "text", "title": "Children & Family", "payload": "show Kids movies" },
                        { "content_type": "text", "title": "Action & Adventure", "payload": "show Action movies" },
                        { "content_type": "text", "title": "Documentary", "payload": "show Documentary movies" },
                        { "content_type": "text", "title": "Mystery", "payload": "show Mystery movies" },
                        { "content_type": "text", "title": "More Categories ", "payload": "show categories list pageno: 2" }
                    ]
                }
            };
            break;
        default:
            categlist = {
                "facebook":
                {
                    "text": "I can also sort my recommendations for you by genre. Type or tap below",
                    "quick_replies": [
                        { "content_type": "text", "payload": "Show Comedy movies", "title": "Comedy" },
                        { "content_type": "text", "payload": "Show Drama movies", "title": "Drama" },
                        { "content_type": "text", "title": "Music", "payload": "show Music shows" },
                        { "content_type": "text", "payload": "Show Sports program", "title": "Sports" },
                        { "content_type": "text", "payload": "show Sci-Fi movies", "title": "Sci-Fi" },
                        { "content_type": "text", "title": "Children & Family", "payload": "show Kids movies" },
                        { "content_type": "text", "title": "Action & Adventure", "payload": "show Action movies" },
                        { "content_type": "text", "title": "Documentary", "payload": "show Documentary movies" },
                        { "content_type": "text", "title": "Mystery", "payload": "show Mystery movies" }
                        // { "content_type": "text", "payload":"show categories list pageno: 1" , "title":"More Categories "}
                    ]
                }
            };
            break;
    }
    sendFBMessage(senderid, categlist.facebook, userCoversationArr);*/

}

function support(senderid, userCoversationArr) {

    logger.debug("support");
    staticMessages("SUPPORT", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });

    //var inputstr = "<sprinkler>true</sprinkler>";
    //updateAndGetSession(senderid, inputstr, "", "BotRequest1");
    //displayProgIndicator(false, userCoversationArr.receipentid);
    /*var respobj =
        {
            "facebook":
            {
                "attachment":
                {
                    "type": "template",
                    "payload":
                    {
                        "template_type": "button",
                        "text": "I try to help with everything, but it seems like you may need some extra assistance! Let me get you over to an expert to help.",
                        "buttons":
                        [
                            {
                                "type": "postback",
                                "title": "Chat with Agent",
                                "payload": "Chat with Agent"
                            }
                        ]
                    }
                }
            }
        };

    sendFBMessage(senderid, respobj.facebook, userCoversationArr);*/

	/*
    var inputstr = "<sprinkler>true</sprinkler>"
    async.series({
        one: function (callback) {
            var xVal = updateAndGetSession(senderid, inputstr, "", "BotRequest1", function (data) {

                callback(null, data);

                logger.debug('CallBack processevent add sprinkler flag to true from updateAndGetSession_1');
            });
        }
    }, function (err, results) {
        logger.debug('Made sprinkler as true');
        sendFBMessage(senderid, { text: "Agent will be with you shortly" }, userCoversationArr);
    }); */
}

function accountlinking(senderid, userCoversationArr) {
    logger.debug('START Account Linking Button');

    var respobj = {
        "facebook":
        {
            "attachment":
            {
                "type": "template", "payload":
                {
                    "template_type": "generic", "elements": [
                        {
                            "title": "Login to Verizon", "image_url": config.vzImage, "buttons": [
                                {
                                    "type": "account_link",
                                    "url": config.AccountLink
                                },
                                {
                                    "type": "postback",
                                    "title": "Maybe later",
                                    "payload": "Main Menu"
                                },
                                {
                                    "type": "postback",
                                    "title": "More Options",
                                    "payload": "More Options"
                                }]
                        }]
                }
            }
        }
    };
	logger.debug('END Account Linking Button');
    sendFBMessage(senderid, respobj.facebook, userCoversationArr);

}

function accountUnlink(senderid, logoutTitle, userCoversationArr) {

    logger.debug('START Account Unlinking Button');
    //logger.debug('Logout Title ' + logoutTitle);
    var respobj =
        {
            "facebook":
            {
                "attachment":
                {
                    "type": "template", "payload":
                    {
                        "template_type": "generic", "elements":
                        [
                            {
                                "title": logoutTitle,
                                "buttons":
                                [
                                    {
                                        "type": "account_unlink"
                                    },
                                    {
                                        "type": "postback",
                                        "title": "Continue",
                                        "payload": "Main Menu"
                                    }
                                ]
                            }
                        ]
                    }
                }
            }
        };

		logger.debug('END Account UN Linking Button');
    sendFBMessage(senderid, respobj.facebook, userCoversationArr);

}

function getvzUserID(authcode, userCoversationArr, callback) {
    // Using Authcode pull the user ID from DB.
    logger.debug("getvzUserID started");
    //logger.debug(" getvzUserID Auth Code " + authcode);
    try {
        var args = {
            json: {
                Request: {
                    op: "GETFBACCOUNTLINKDETAILS",
                    Authcode: authcode
                }
            }
        }
        logger.debug('Request json for getvzUserID using Auth code ' + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);
        request({
            url: config.FTCV_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                callback(body);
            }
            else {
				logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on getvzuserID : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {

        logger.debug('error for interactionID ' + userCoversationArr.interactionid + '  on  getvzuserID : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug("getvzUserID completed");
}

function getvzUserIDCallback(apiresp, paramArr, userCoversationArr) {

    logger.debug("getvzUserIDCallback started");

    var objToJson = {};
    objToJson = apiresp;
	logger.debug("Response from UFD for getvzUserIDCallback for interactionid " + userCoversationArr.interactionid + JSON.stringify(apiresp));
    try {
        if ((objToJson != null) &&
            (objToJson.oDSAccountDetails != null) &&
            (objToJson.oDSAccountDetails.oDAAccountDetails != null)) {

            var UD_UserID = objToJson.oDSAccountDetails.oDAAccountDetails.strUserID;

            //logger.debug(" UserID:" + JSON.stringify(UD_UserID))

            paramArr.userIdParam = UD_UserID;

            if (config.isSession == "yes") {

                // Update user id to the session
                var inputstr = "<userid>" + UD_UserID + "</userid><isuserloggedin>yes</isuserloggedin>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                            callback(null, data);

                            logger.debug('Updated the Userid into the session');
                        });
                    }
                }, function (err, results) {
                    logger.debug('Updated the Userid into the session');

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Updated the Userid into the session ', sessionStartTime, sessionEndTime);

                });

            }
        }
        else {
            logger.debug('No Response from UFD for getvzUserID  for interactionID ' + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }

    }
    catch (err) {

        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on getvzUserIDCallback : ' + err);
        commonError(userCoversationArr, 'ufdres');
    }

    getVzProfileAccountUpdate(UD_UserID, userCoversationArr, function (str) { getVzProfileAccountUpdateCallBack(str, paramArr, userCoversationArr) });

    logger.debug("getvzUserIDCallback completed");
}

function getVzProfileAccountUpdate(struserid, userCoversationArr, callback) {
    logger.debug('Inside getVzProfileAccountUpdate Profile');
    try {
        var args = {
            json: {
                Flow: config.FlowName,
                Request: { ThisValue: 'GetProfile', Userid: struserid }
            }

        };
        logger.debug("Request Json for getting the vzprofile details " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //console.log("body " + body);
                callback(body);
            }
            else {
                commonError(userCoversationArr, 'ufdres');
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on getting the vzprofile details using user ID: ' + error + ' body: ' + JSON.stringify(body));
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  vzprofile detail : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug('Inside getVzProfileAccountUpdate completed');
}

function getVzProfileAccountUpdateCallBack(apiresp, paramArr, userCoversationArr) {
    logger.debug('Inside getVzProfileAccountUpdateCallBack');
    try {

        var strUserid = paramArr.userIdParam;
        var strAuth1 = paramArr.authCodeParam;
        var senderid = paramArr.senderParam;

        var objToJson = {};
        objToJson = apiresp;
		
		logger.debug("Response from UFD for getVzProfileAccountUpdateCallBack for interactionid " + userCoversationArr.interactionid + JSON.stringify(apiresp));
		
		
        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            //logger.debug("Response from getVzProfileAccountUpdateCallBack " + JSON.stringify(objToJson) + " for interactionID  " + userCoversationArr.interactionid);

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            var profileDetails = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            var CKTID_1 = JSON.stringify(profileDetails.ProfileResponse.CKTID, null, 2)
            var regionId = JSON.stringify(profileDetails.ProfileResponse.regionId, null, 2)
            var vhoId = JSON.stringify(profileDetails.ProfileResponse.vhoId, null, 2)
            var CanNo = JSON.stringify(profileDetails.ProfileResponse.Can, null, 2)
            var VisionCustId = JSON.stringify(profileDetails.ProfileResponse.VisionCustId, null, 2)
            var VisionAcctId = JSON.stringify(profileDetails.ProfileResponse.VisionAcctId, null, 2)
            var timeOffset = JSON.stringify(profileDetails.ProfileResponse.timeOffset, null, 2)
            var VCP = JSON.stringify(profileDetails.ProfileResponse.VCP, null, 2)

            if (config.isSession == "yes") {

                var inputstr = "<timeoffset>" + timeOffset.replace(/\"/g, "") + "</timeoffset><vcp>" + VCP.replace(/\"/g, "") + "</vcp><circuitid>" + CKTID_1.replace(/\"/g, "") + "</circuitid><vhoId>" + vhoId.replace(/\"/g, "") + "</vhoId><regionId>" + regionId.replace(/\"/g, "") + "</regionId>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                            callback(null, data);

                            logger.debug("Updated the profile details into the session");
                        });
                    }
                }, function (err, results) {
                    logger.debug("Updated the profile details into the session");

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Updated the profile details into the session', sessionStartTime, sessionEndTime);

                });

            }

            var args = {
                json: {
                    Request: {
                        op: "FBACCOUNTLINKACTIVITY",
                        VHOID: vhoId != null ? vhoId.replace(/\"/g, "") : null,
                        RegionID: regionId != null ? regionId.replace(/\"/g, "") : null,
                        CircuitID: CKTID_1 != null ? CKTID_1.replace(/\"/g, "") : null,
                        SenderID: senderid != null ? senderid.replace(/\"/g, "") : null,
                        UserID: strUserid != null ? strUserid.replace(/\"/g, "") : null,
                        CanNo: CanNo != null ? CanNo.replace(/\"/g, "") : null,
                        VisionCustId: VisionCustId != null ? VisionCustId.replace(/\"/g, "") : null,
                        VisionAcctId: VisionAcctId != null ? VisionAcctId.replace(/\"/g, "") : null,
                        timeOffset: timeOffset != null ? timeOffset.replace(/\"/g, "") : null,
                        VCP: VCP != null ? VCP.replace(/\"/g, "") : null,
                        Authcode: strAuth1 != null ? strAuth1.replace(/\"/g, "") : null
                    }
                }
            }

            logger.debug('Request jSON for updating the vzprofile details ' + JSON.stringify(args));

            request({
                url: config.FTCV_rest_api,
                proxy: config.vz_proxy,
                headers: config.headersInfo,
                method: 'POST',
                json: args.json
            }, function (error, response, body) {
                if (!error && response.statusCode == 200) {

                    // Need a session fix
                    var searchneeded = updateAndGetSession_1(userCoversationArr.senderid, "", "searchneeded", "BotRequest1");
                    var cxquestion = updateAndGetSession_1(userCoversationArr.senderid, "", "cxquestion", "BotRequest1");
                    var recordneeded = updateAndGetSession_1(userCoversationArr.senderid, "", "recordneeded", "BotRequest1");

                    if (searchneeded == 'yes') {

                        // Search needed both serves for package search and program search 

                        //logger.debug("Searchneeded " + searchneeded);

                        callapiai(cxquestion, userCoversationArr.senderid, sessionIds, userCoversationArr);

                        var inputstr = "<searchneeded>no</searchneeded>";

                        var sessionStartTime = getDateTime();
                        var sessionEndTime;

                        async.series({
                            one: function (callback) {
                                var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest1", function (data) {

                                    callback(null, data);

                                    logger.debug('Updated the search not needed flag to false into the session');
                                });
                            }
                        }, function (err, results) {
                            logger.debug('Updated the search needed flag to false into the session');

                            sessionEndTime = getDateTime();
                            getsecondstaken('session for Updated the search needed flag to false into the session', sessionStartTime, sessionEndTime);

                        });
                    }
                    else if(recordneeded == "yes") {

                        //logger.debug("recordneeded " + recordneeded);

                        var inputstr = "<recordneeded>no</recordneeded>";

                        var sessionStartTime = getDateTime();
                        var sessionEndTime;

                        async.series({
                            recorddetails: function (callback) {
                                var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "recorddetails", "BotRequest1", function (data) {
                                    callback(null, data);
                                    logger.debug('CallBack RecordDetails updateAndGetSession_1');
                                });
                            }
                        }, function (err, results) {

                            var recordetails = results.recorddetails;
                            logger.debug('Updated the recorddneeded value to NO and get the record details value ' + results.recorddetails );

                            sessionEndTime = getDateTime();
                            getsecondstaken('session for Updated the recorddneeded value to NO and get the record details value', sessionStartTime, sessionEndTime);

                            callapiai(recordetails, userCoversationArr.senderid, sessionIds, userCoversationArr);
                        });

                    }
                    else {

                        //logger.debug("BAU Login welcome message");
                        sendFBMessage(senderid, { text: "Great! You have linked me to your Verizon account.You can unlink me whenever you want by tapping the bottom left menu." }, userCoversationArr);
                        MainMenu(senderid, userCoversationArr);
                    }
                }
                else {
                    logger.debug('error on updating the vzprofile details : ' + error + ' body: ' + JSON.stringify(body));
                    var authCode = "RetryAuthCode|" + paramArr.authCodeParam;
                    var template = { "attachment": { "type": "template", "payload": { "template_type": "button", "text": "Sorry, looks like there was a problem linking to your Verizon account. Tap below for support", "buttons": [{ "type": "postback", "title": "Retry Account Link", "payload": "Link Account" }, { "type": "postback", "title": "Link Account later", "payload": "Main Menu" }] } } }
                    sendFBMessage(senderid, template, userCoversationArr);
                }
            });
        }
        else {

            logger.debug("No response from FTVC api call for getting profile information  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdreq');
        }
    }
    catch (err) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + '---' + err);
        var senderid = paramArr.senderParam;
        var authCode = "RetryAuthCode|" + paramArr.authCodeParam;
        var template = { "attachment": { "type": "template", "payload": { "template_type": "button", "text": "Sorry, looks like there was a problem linking to your Verizon account. Tap below for support", "buttons": [{ "type": "postback", "title": "Retry Account Link", "payload": "Link Account" }, { "type": "postback", "title": "Link Account later", "payload": "Main Menu" }] } } }
        sendFBMessage(senderid, template, userCoversationArr);
    }

    logger.debug('Inside getVzProfileAccountUpdateCallBack completed');
}

function GetAuthProfile(senderArr, userCoversationArr, callback) {

    logger.debug('Inside GetAuthProfile started');
    var senderid = senderArr.senderParam;
    try {
        //logger.debug("Sender ID " + senderid);

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'GetAuthProfile',
                    BotProviderId: senderid
                }
            }

        };
        logger.debug("Request args for get auth profile" + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on posting getauth profile : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on  getauth profile detail : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug('Inside GetAuthProfile completed');
}

function GetAuthProfileCallback(apiresp, senderArr, userCoversationArr) {
    logger.debug('Inside GetAuthProfile callback started');
    var objToJson = {};
    objToJson = apiresp;
    try {

		logger.debug("Response from UFD for GetAuthProfileCallback for interactionid " + userCoversationArr.interactionid + JSON.stringify(apiresp));

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            //logger.debug("subflow " + JSON.stringify(subflow));

            if (subflow != null && subflow == 'UserNotFound') {
                logger.debug("User Not Found" + " for interactionID  " + userCoversationArr.interactionid);
                logger.debug("userid " + subflow + " for interactionID  " + userCoversationArr.interactionid);

                accountlinking(senderArr.senderParam, userCoversationArr);
            }
            else {
                logger.debug("User Found" + " for interactionID  " + userCoversationArr.interactionid);
                logger.debug("userid " + subflow + " for interactionID  " + userCoversationArr.interactionid);

                //accountUnlink(senderArr.senderParam);
                getFBNameprofile(senderArr.senderParam, userCoversationArr, function (str) { getFBNameprofilecallback(str, senderArr.senderParam, userCoversationArr) });
            }

        }
        else {

            logger.debug("No response from UFD api call to check user is authenticated or not - GetAuthProfileCallback for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }
    }
    catch (err) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on posting getauth profile : ' + error + ' body: ' + JSON.stringify(body));
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug('Inside GetAuthProfile callback completed');
}

function GetAuthMessageCallback(apiresp, senderArr, userCoversationArr) {
    logger.debug('Inside GetAuthMessageCallback started');
    var objToJson = {};
    objToJson = apiresp;

    try {

        var senderid = senderArr.senderParam;
		logger.debug("Response from UFD for GetAuthMessageCallback for interactionid " + userCoversationArr.interactionid + JSON.stringify(apiresp));

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            //logger.debug("subflow " + JSON.stringify(subflow) + " for interactionID  " + userCoversationArr.interactionid);

            if (subflow != null && subflow == 'UserNotFound') {
                logger.debug("User Not Found" + " for interactionID  " + userCoversationArr.interactionid);
                //logger.debug("userid " + subflow + " for interactionID  " + userCoversationArr.interactionid);
                welcomeMsg(senderid, userCoversationArr);
            }
            else {
                logger.debug("User Found" + " for interactionID  " + userCoversationArr.interactionid);
                //logger.debug("userid " + subflow + " for interactionID  " + userCoversationArr.interactionid);
                MainMenu(senderid, userCoversationArr);
            }
        }
        else {
            logger.debug("No response from UFD api call to check user is authenticated or not - GetAuthMessageCallback  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }

    }
    catch (err) {
        logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on posting getauth profile : ' + error + ' body: ' + JSON.stringify(subflow));
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug('Inside GetAuthProfile callback completed');
}

function getFBNameprofile(sessionID, userCoversationArr, callback) {
    logger.debug('Inside getFBNameprofile started');
    // Get the users profile information from FB
    request({
        url: 'https://graph.facebook.com/v2.8/' + sessionID + '?fields=first_name',
        proxy: config.vz_proxy,
        qs: { access_token: FB_PAGE_ACCESS_TOKEN },
        method: 'GET'
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            callback(body)
        } else {
            // TODO: Handle errors
            logger.debug("Get FB user profile failed");
        }
    });
    logger.debug('Inside getFBNameprofile completed');
}

function getFBNameprofilecallback(apiresp, sessionID, userCoversationArr) {

    logger.debug('Inside getFBNameprofilecallback started');
    apiresp = JSON.parse(apiresp);

    var greetingMessage = '';
    var logoutMessage = ", you are already logged-in. Do you want to log out or continue?"

    try {

        //logger.debug("FB Get Profile response " + JSON.stringify(apiresp) + " for interactionID  " + userCoversationArr.interactionid);

        if (apiresp != null && apiresp != 'undefined') {
            //logger.debug("FB First Name " + apiresp.first_name);

            if (apiresp.first_name != null && apiresp.first_name != 'undefined') {
                greetingMessage = "Hey " + apiresp.first_name;
                logoutMessage = greetingMessage + logoutMessage;
            }
            accountUnlink(sessionID, logoutMessage, userCoversationArr)
        }
        else {
            logger.debug("no userName from facebook " + " for interactionID  " + userCoversationArr.interactionid);
            accountUnlink(sessionID, "You are already logged-in. Do you want to log out or continue?", userCoversationArr)
        }
    }
    catch (err) {
        logger.debug('error on getting the FB details : ' + err + ' body: ' + JSON.stringify(apiresp));
    }

    logger.debug('Inside getFBNameprofilecallback callback completed');
}

function DeleteAuthProfile(senderid, userCoversationArr, callback) {
    logger.debug("DeleteAuthProfile started ");
    try {
        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'DeleteAuthProfile',
                    BotProviderId: senderid
                }
            }

        };

        logger.debug("Request Json for delete Auth Profile " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("body " + body);
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on delete auth profile callback : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on DeleteAuthProfile : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("DeleteAuthProfile Ended ");
}

function DeleteAuthProfileCallback(apiresp, senderid, userCoversationArr) {
    logger.debug("DeleteAuthProfileCallback enter ");
    try {
        var objToJson = {};
        objToJson = apiresp;

        logger.debug("Response Json for Delete Auth Profile " + JSON.stringify(apiresp) + " for interactionID  " + userCoversationArr.interactionid);

        if (objToJson[0].Inputs.newTemp == undefined) {

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'error';
            printChatHistory(userCoversationArr);

            sendFBMessage(senderid, { text: "Unable to process the request" }, userCoversationArr);
        }
        else {
            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            if (subflow != null && subflow == 'Success') {
                //logger.debug("userid at successs " + subflow);
                sendFBMessage(senderid, { text: "Your account has been unlinked" }, userCoversationArr);

                if (config.isSession == "yes") {

                    //Clear the customer info on session too.
                    var inputstr = "<ReplaceSession>YES</ReplaceSession><timeoffset></timeoffset><vcp></vcp><isuserloggedin>no</isuserloggedin><circuitid></circuitid><vhoId></vhoId><regionId></regionId><userid></userid>";

                    var sessionStartTime = getDateTime();
                    var sessionEndTime;

                    async.series({
                        one: function (callback) {
                            var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                                callback(null, data);

                                logger.debug('clear the user details on the session');
                            });
                        }
                    }, function (err, results) {

                        logger.debug('clear the user details on the session');

                        sessionEndTime = getDateTime();
                        getsecondstaken('session for clear the user details on the session', sessionStartTime, sessionEndTime);
                    });
                }

            }
            else {
                //logger.debug("userid if not success " + subflow);
                sendFBMessage(senderid, { text: "Unable to process the request" }, userCoversationArr);
            }
        }
    }
    catch (err) {
        logger.debug("Error  for interactionID " + userCoversationArr.interactionid + " on DeleteAuthProfileCallback " + err);
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("DeleteAuthProfileCallback completed ");

}

function packageChannelSearch(senderid, ChnArr, userCoversationArr, callback) {

    logger.debug("Package Channel Search Called");
    try {
        var channe_Name = ChnArr.channalName;
        var senderid = ChnArr.senderParam;
        var genre = ChnArr.Genre;

        //logger.debug(" Sender ID " + senderid);
        //logger.debug(" Channel Name " + channe_Name);
        //logger.debug(" Genre " + genre);

        var args = {};
        if (genre == "" || genre == undefined) {
            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        'ThisValue': 'AuthPKGSearch',
                        'BotCircuitID': '',
                        'BotstrStationCallSign': channe_Name,
                        'BotChannelNo': '',
                        'BotVhoId': '',
                        'BotstrFIOSRegionID': '',
                        'BotProviderId': senderid
                    }
                }

            };
        }
        else {
            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        'ThisValue': 'AuthPKGSearch',
                        'BotCircuitID': '',
                        'BotstrGenreRootId': genre,
                        'BotChannelNo': '',
                        'BotVhoId': '',
                        'BotstrFIOSRegionID': '',
                        'BotProviderId': senderid
                    }
                }

            };

        }


        logger.debug(" Request for package search json " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                callback(body);
            }
            else {
                logger.debug(' error  for interactionID ' + userCoversationArr.interactionid + ' on callback for package search : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error for interactionID ' + userCoversationArr.interactionid + '  on  package search : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug("Package Channel Search completed");
}

function packageChannelSearchCallback(apiresp, ChnArr, userCoversationArr) {

    logger.debug("packageChannelSearchCallback called");

    var senderid = ChnArr.senderParam;
    var channe_Name = ChnArr.channalName;
    var Genre = ChnArr.Genre;
    var returntext;
    var objToJson = {};

    objToJson = apiresp;

    try {

        logger.debug("Response from packageChannelSearchCallback " + JSON.stringify(objToJson) + " for interactionID  " + userCoversationArr.interactionid);

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            var respobj = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            //logger.debug(" Package Search Response " + JSON.stringify(respobj) + " for interactionID  " + userCoversationArr.interactionid);


            if (respobj != null &&
                respobj.facebook != null &&
                respobj.facebook.attachment != null) {

                //Single Button Fixed

                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.elements != null) {

                    try {

                        var objlength = respobj.facebook.attachment.payload.elements.length;

                        for (var i = 0; i < objlength; i++) {

                            var elementsButton = respobj.facebook.attachment.payload.elements[i].buttons;

                            if (!util.isArray(elementsButton)) {
                                respobj.facebook.attachment.payload.elements[i].buttons = [];
                                respobj.facebook.attachment.payload.elements[i].buttons.push(elementsButton);
                            }
                        }

                        //logger.debug("Afer one button fix" + JSON.stringify(respobj) + " for interactionID  " + userCoversationArr.interactionid);


                    } catch (err) { logger.debug("Error for interactionID " + userCoversationArr.interactionid + " on package search callback" + err); commonError(userCoversationArr, 'ufdres'); }
                }

                //fix to single element array 
                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.elements != null) {
                    try {
                        var chanls = respobj.facebook.attachment.payload.elements;
                        //console.log(" Is array? " + util.isArray(chanls))
                        if (!util.isArray(chanls)) {
                            respobj.facebook.attachment.payload.elements = [];
                            respobj.facebook.attachment.payload.elements.push(chanls);
                           // logger.debug(" Package Search CallBack = After =" + JSON.stringify(respobj) + " for interactionID  " + userCoversationArr.interactionid);
                        }
                    } catch (err) { logger.debug("Error on channel not available on PKG Search " + " for interactionID  " + userCoversationArr.interactionid + " error " + err); commonError(userCoversationArr, 'ufdres')}
                }

                if (Genre == "" || Genre == undefined) {
                    if (channe_Name == "" || channe_Name == undefined) {
                        returntext = "Here are some awesome listings included in your package!";
                    }
                    else {
                        returntext = "Good News! Your package does include " + channe_Name + "! Watch it on the channels below!";
                    }
                }
                else {
                    returntext = "Here are the " + Genre + " listings that are on today ! And the good news is they're are all a part of your package. Enjoy!"
                }

                sendFBMessage(senderid, { text: returntext }, userCoversationArr);
                sendFBMessage(senderid, respobj.facebook, userCoversationArr);
            }
            else {

                // Fix for User Not Found

                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.text != null && respobj.facebook.text == 'UserNotFound') {

                    //logger.debug("Package Search Call back - User Not Found " + respobj.facebook.text);

                    respobj = {
                        "facebook": {
                            "attachment": {
                                "type": "template", "payload": {
                                    "template_type": "generic", "elements": [
                                        {
                                            "title": "You have to Login to Verizon to proceed", "image_url": config.vzImage, "buttons": [
                                                {
                                                    "type": "account_link",
                                                    "url": config.AccountLink
                                                },
                                                {
                                                    "type": "postback",
                                                    "title": "Maybe later",
                                                    "payload": "Main Menu"
                                                },
                                                {
                                                    "type": "postback",
                                                    "title": "More Options",
                                                    "payload": "More Options"
                                                }]
                                        }]
                                }
                            }
                        }
                    };

                    // Need a session fix here
                    var inputstr = "<isuserloggedin>no</isuserloggedin>";

                    var sessionStartTime = getDateTime();
                    var sessionEndTime;

                    async.series({
                        one: function (callback) {
                            var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                                callback(null, data);

                                logger.debug('Update the userlogged in value to NO');
                            });
                        }
                    }, function (err, results) {
                        logger.debug('Update the userlogged in value to NO');

                        sessionEndTime = getDateTime();
                        getsecondstaken('session for Update the userlogged in value to NO', sessionStartTime, sessionEndTime);

                    });

                    inputstr = "<searchneeded>yes</searchneeded>";

                    var sessionStartTime = getDateTime();
                    var sessionEndTime;

                    async.series({
                        one: function (callback) {
                            var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest1", function (data) {

                                callback(null, data);

                                logger.debug('Update the pkgsearch needed value to yes in callback');
                            });
                        }
                    }, function (err, results) {
                        logger.debug('Update the pkgsearch needed value to yes in results');

                        sessionEndTime = getDateTime();
                        getsecondstaken('session for Update the pkgsearch needed value to yes in results', sessionStartTime, sessionEndTime);

                    });


                    sendFBMessage(senderid, respobj.facebook, userCoversationArr);

                    return;

                }

                //logger.debug("Sorry i dont find channel details " + " for interactionID  " + userCoversationArr.interactionid);

               /* if (Genre == "" || Genre == undefined) {
                    if (channe_Name == "" || channe_Name == undefined) {
                        returntext = "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?";
                    }
                    else {
                        returntext = "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?";
                    }
                }
                else {
                    returntext = "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?";
                } */

                //sendFBMessage(senderid, commonMessage.facebook, userCoversationArr); 
				staticMessages("PKGSEARCH", userCoversationArr, function (str) { staticMessagesCallback(str, senderid, userCoversationArr) });
				
            }

        }
        else {

            logger.debug("No response from UFD api call for package search  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }
    }
    catch (err) {
        logger.debug("Error  for interactionID " + userCoversationArr.interactionid + " on pkg search call back " + err);
        //var senderid = ChnArr.senderParam;
        //var returntext = "My bad, but I am having trouble finding what you are looking for. Can you try searching for something else?";
        //sendFBMessage(senderid, { text: returntext }, userCoversationArr);

        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("packageChannelSearchCallback completed");
}

function stationsearch(apireq, userCoversationArr, callback) {

    logger.debug('Inside stationsearch started');
    try {
        /*var strChannelName = apireq.result.parameters.Channel.toUpperCase();
        var strChannelNo = apireq.result.parameters.ChannelNo;*/

        var strChannelName = apireq.formattedResponse.parameters.Channel.toUpperCase();
        var strChannelNo = apireq.formattedResponse.parameters.ChannelNo;

        var strRegionid = 91629;

        //logger.debug("strChannelName " + strChannelName + " strChannelNo: " + strChannelNo + " for interactionID  " + userCoversationArr.interactionid);

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'StationSearch',
                    BotRegionID: strRegionid,
                    BotstrFIOSServiceId: strChannelNo, //channel number search
                    BotstrStationCallSign: strChannelName
                }
            }

        };

        logger.debug("Request json for station search " + JSON.stringify(args) + " for interaction ID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //console.log("body " + body);
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on sending request to station search: ' + error + ' body: ' + body);
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  station search detail : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug('Inside stationsearch completed');
}

function stationsearchCallback(apiresp, senderid, userCoversationArr) {
    logger.debug("<<< Inside stationsearchCallback >>>");
    var objToJson = {};
    objToJson = apiresp;
    try {

        logger.debug("Response from stationsearchcallback " + JSON.stringify(apiresp) + " for interactionID  " + userCoversationArr.interactionid);

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {


            var respobj = objToJson[0].Inputs.newTemp.Section.Inputs.Response;
            //logger.debug("Station Search Response " + JSON.stringify(respobj) + " for interactionID  " + userCoversationArr.interactionid);

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            if (respobj != null && respobj.facebook != null && respobj.facebook.channels != null) {

                if (respobj.facebook.channels.channel) {

                    var entries = respobj.facebook.channels.channel;

                    entries.forEach((channel) => {
                        sendFBMessage(senderid, { text: channel }, userCoversationArr);
                    }
                    )
                };
            }
            else if (respobj != null && respobj.facebook != null && respobj.facebook.attachment != null) {

                //fix to single element array 
                if (respobj != null
                    && respobj.facebook != null
                    && respobj.facebook.attachment != null
                    && respobj.facebook.attachment.payload != null
                    && respobj.facebook.attachment.payload.elements != null) {
                    try {
                        var chanls = respobj.facebook.attachment.payload.elements;

                        if (!util.isArray(chanls)) {
                            respobj.facebook.attachment.payload.elements = [];
                            respobj.facebook.attachment.payload.elements.push(chanls);
                        }

                        var objlength = respobj.facebook.attachment.payload.elements.length;
                        for (var i = 0; i < objlength; i++) {
                            var elementsButton = respobj.facebook.attachment.payload.elements[i].buttons;
                            if (!util.isArray(elementsButton)) {
                                respobj.facebook.attachment.payload.elements[i].buttons = [];
                                respobj.facebook.attachment.payload.elements[i].buttons.push(elementsButton);
                            }
                        }


                    } catch (err) { logger.debug('error on array list on station search ' + err); commonError(userCoversationArr, 'ufdres'); }
                }

                sendFBMessage(senderid, respobj.facebook, userCoversationArr);
            }
            else {
                logger.debug("Sorry i dont find channel details" + " for interactionID  " + userCoversationArr.interactionid);
                commonError(userCoversationArr, 'ufdres');
            }
        }
        else {
            logger.debug("No response from UFD api call for station search  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');

        }
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  station search detail : ' + experr);
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("station search completed");
}

function PgmSearch(apireq, sender, userCoversationArr, callback) {
    logger.debug("<<<Inside PgmSearch>>>");

    try {

        /*var strProgram = apireq.result.parameters.Programs;
        var strGenre = apireq.result.parameters.Genre;
        var strdate = apireq.result.parameters.date;
        var strChannelName = apireq.result.parameters.Channel;
        var strFiosId = apireq.result.parameters.FiosId;
        var strStationId = apireq.result.parameters.StationId;
        var strRegionId = "";
        var intpageid = apireq.result.parameters.PageNo;
        var strTeam = apireq.result.parameters.Teams;
        var strCast = apireq.result.parameters.Cast;
        var ActualServiceId = apireq.result.parameters.ActualServiceId;*/

        var strRegionId = "";
        var strProgram = apireq.formattedResponse.parameters.Programs;
        var strGenre = apireq.formattedResponse.parameters.Genre;
        var strdate = apireq.formattedResponse.parameters.date;
        var strChannelName = apireq.formattedResponse.parameters.Channel;
        var strFiosId = apireq.formattedResponse.parameters.FiosId;
        var strStationId = apireq.formattedResponse.parameters.StationId;
        var intpageid = apireq.formattedResponse.parameters.PageNo;
        var strTeam = apireq.formattedResponse.parameters.Teams;
        var strCast = apireq.formattedResponse.parameters.Cast;
        var ActualServiceId = apireq.formattedResponse.parameters.ActualServiceId;

        //var headersInfo = { "Content-Type": "application/json" };

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'AuthPgmSrchPayload',//'AdvProgramSearch', //'ProgramSearchNew', //  EnhProgramSearch
                    BotProviderId: sender, //'1113342795429187',  // usersession ; sender id
                    BotstrTitleValue: strProgram,
                    BotdtAirStartDateTime: strdate,
                    BotstrGenreRootId: strGenre,
                    BotstrStationCallSign: strChannelName,
                    BotstrFIOSRegionID: strRegionId,
                    BotstrFIOSID: strFiosId,
                    BotstrFIOSServiceId: strStationId,
                    BotstrCastCreditNamesRoles: strCast,
                    BotPaginationID: intpageid,
                    BotstrEpisodeTitleValue: strTeam,
                    BotstrActualFIOSServiceId: ActualServiceId
                }
            }
        };

        logger.debug("Request for Pgrm search " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on program search psting: ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  program search psting : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("Program search completed");
}

function DSPgmSearch(apireq, sender, userCoversationArr, callback) {
    logger.debug("<<<Inside DSPgmSearch>>>");

    try {

        var strProgram = apireq.formattedResponse.parameters.Programs;
        var strGenre = apireq.formattedResponse.parameters.Genre;
        var strdate = apireq.formattedResponse.parameters.date;
        var strChannelName = apireq.formattedResponse.parameters.Channel;
        var strFiosId = apireq.formattedResponse.parameters.FiosId;
        var strStationId = apireq.formattedResponse.parameters.StationId;
        var strRegionId = "";
        var intpageid = apireq.formattedResponse.parameters.PageNo;
        var strTeam = apireq.formattedResponse.parameters.Teams;
        var strCast = apireq.formattedResponse.parameters.Cast;
        var strSeriesId = apireq.formattedResponse.parameters.SeriesId;
        var ActualServiceId = apireq.formattedResponse.parameters.ActualServiceId;

        //var headersInfo = { "Content-Type": "application/json" };

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'DSProgramSearch',//'AuthPgmSrchPayload',//'AdvProgramSearch', //'ProgramSearchNew', //  EnhProgramSearch
                    BotProviderId: sender, //'1113342795429187',  // usersession ; sender id
                    BotstrTitleValue: strProgram,
                    BotdtAirStartDateTime: strdate,
                    BotstrGenreRootId: strGenre,
                    BotstrStationCallSign: strChannelName,
                    BotVCP: '3416',//strRegionId,
                    BotVhoId: 'VHO4',
                    BotTimeOffset: '5',
                    BotstrFIOSID: strFiosId,
                    BotstrFIOSServiceId: strStationId,
                    BotstrCastCreditNamesRoles: strCast,
                    BotPaginationID: intpageid,
                    BotstrEpisodeTitleValue: strTeam,
                    BotSeriesId: strSeriesId,
                    BotstrActualFIOSServiceId: ActualServiceId
                }
            }
        };

        logger.debug("Request for DSPgmSearch " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {


                callback(body);
            }
            else {

                logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on DSPgmSearch posting: ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  DSPgmSearch posting : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("DSPgmSearchcompleted");
}

function DSEpisodeDetails(apireq, sender, userCoversationArr, callback) {
    logger.debug("<<<Inside DSEpisodeDetails>>>");

    // logger.debug("User ID from Session " + updateAndGetSession(userCoversationArr.senderid, "", "userid", "BotRequest2"));

    try {

        //logger.debug("apiai resp for DSEpisodeDetails " + JSON.stringify(apireq) + " for interactionID  " + userCoversationArr.interactionid);

        var strdate = apireq.formattedResponse.parameters.date;
        var strRegionId = "";
        var intpageid = apireq.formattedResponse.parameters.PageNo;
        var strSeriesId = apireq.formattedResponse.parameters.SeriesID;

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'DSEpisodeDetails',
                    BotProviderId: sender,
                    BotdtAirStartDateTime: strdate,
                    BotstrFIOSRegionID: '3416',
                    BotVhoId: 'VHO4',
                    BotPaginationID: intpageid,
                    BotstrSeriesId: strSeriesId,
                    BotintChannelPosition: '5' //intTimezoneOffset
                }
            }
        };

        logger.debug("Request for DSEpisodeDetails " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("Body of program search call " + JSON.stringify(body));
                callback(body);
            }
            else {

                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on DSEpisodeDetails posting: ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  DSEpisodeDetails psting : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("DSEpisodeDetails completed");
}

function DSShowSchedule(apireq, sender, userCoversationArr, callback) {
    logger.debug("<<<Inside DSShowSchedule>>>");

    //logger.debug("User ID from Session " + updateAndGetSession(userCoversationArr.senderid, "", "userid", "BotRequest2"));

    try {

        //logger.debug("apiai resp " + JSON.stringify(apireq.formattedResponse.parameters) + " for interactionID  " + userCoversationArr.interactionid);

        var strdate = apireq.formattedResponse.parameters.date;
        var strRegionId = "";
        var intpageid = apireq.formattedResponse.parameters.PageNo;
        var strFiosId = apireq.formattedResponse.parameters.FiosId;

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'DSShowSchedule',
                    BotProviderId: sender,
                    BotdtAirStartDateTime: strdate,
                    BotstrFIOSRegionID: '3416',
                    BotVhoId: 'VHO4',
                    BotPaginationID: intpageid,
                    BotstrFIOSID: strFiosId,
                    BotintChannelPosition: '5' //intTimezoneOffset
                }
            }
        };

        logger.debug("Request for DSShowSchedule " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("Body of DSShowSchedule call " + JSON.stringify(body));
                callback(body);
            }
            else {

                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on DSShowSchedule: ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on DSShowSchedule : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("DSShowSchedule completed");
}

function DSPgmSearchWithTime(apireq, sender, userCoversationArr, callback) {
    logger.debug("<<<Inside DSPgmSearchWithTime>>>");

    try {

        var strProgram = apireq.formattedResponse.parameters.Programs;
        var strGenre = apireq.formattedResponse.parameters.Genre;
        var strdate = apireq.formattedResponse.parameters.date;
        var strChannelName = apireq.formattedResponse.parameters.Channel;
        var strFiosId = apireq.formattedResponse.parameters.FiosId;
        var strStationId = apireq.formattedResponse.parameters.StationId;
        var strRegionId = "";
        var intpageid = apireq.formattedResponse.parameters.PageNo;
        var strTeam = apireq.formattedResponse.parameters.Teams;
        var strCast = apireq.formattedResponse.parameters.Cast;
        var strSeriesId = apireq.formattedResponse.parameters.SeriesId;
        var ActualServiceId = apireq.formattedResponse.parameters.ActualServiceId;


		var strTime = apireq.formattedResponse.parameters.QueryTime;
		var strTimePeriod = apireq.formattedResponse.parameters.timeperiod;
		var strContentType = apireq.formattedResponse.parameters.ContentType;


        if (strTimePeriod !=undefined && strTimePeriod !='')
                  strTime = strTimePeriod.split("/",1)[0];

        //logger.debug("strTimePeriod- " + strTimePeriod +" strTime  -"+ strTime );

        //var headersInfo = { "Content-Type": "application/json" };

        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'DSProgramSearchWithTime',
                    BotProviderId: sender, //'1113342795429187',  // usersession ; sender id
                    BotstrTitleValue: strProgram,
                    BotAirDate: strdate,
                    BotstrGenreRootId: strGenre,
                    BotstrStationCallSign: strChannelName,
                    BotVCP: '3416',//strRegionId,
                    BotVhoId: 'VHO4',
                    BotTimeOffset: '5',
                    BotstrFIOSID: strFiosId,
                    BotstrFIOSServiceId: strStationId,
                    BotstrCastCreditNamesRoles: strCast,
                    BotPaginationID: intpageid,
                    BotstrEpisodeTitleValue: strTeam,
                    BotSeriesId: strSeriesId,
                    BotstrActualFIOSServiceId: ActualServiceId,
                    BotAirTime : strTime,
                    BotPgmType : strContentType 
                }
            }
        };

        logger.debug("Request for DSPgmSearchWithTime " + JSON.stringify(args) + "for interactionID " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {


                callback(body);
            }
            else {

                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on program search psting: ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  program search psting : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("Program search completed");
}

function PgmSearchCallback(apiresp, apiintent, usersession, userCoversationArr) {
    logger.debug("PgmSearchCallback statted");
    var objToJson = {};
    objToJson = apiresp;
    var merged_object = '';

    var vodpromo = '';
    try {

        logger.debug("Response from PgmSearchCallback " + JSON.stringify(apiresp) + " for interactionID  " + userCoversationArr.interactionid);

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;
            //logger.debug("Response from PgmSearchCallback " + JSON.stringify(subflow));

            var strGenre = apiintent.formattedResponse.parameters.Genre;
            var strCast = apiintent.formattedResponse.parameters.Cast;
            var strTitle = apiintent.formattedResponse.parameters.Programs;

            /*
            if (strGenre != undefined && strGenre != '') {

                vodpromo = { "quick_replies": [{ "content_type": "text", "title": strGenre + " On Demand", "payload": strGenre + " movies On Demand" }] };
                logger.debug("VOD PROMO" + JSON.stringify(vodpromo));
            }

            if (strCast != undefined && strCast != '') {

                vodpromo = { "quick_replies": [{ "content_type": "text", "title": strCast + " On Demand", "payload": strCast + " movies On Demand" }] };
                logger.debug("VOD PROMO" + JSON.stringify(vodpromo));
            }

            if (strTitle != undefined && strTitle != '') {

                vodpromo = { "quick_replies": [{ "content_type": "text", "title": strTitle + " On Demand", "payload": " i want to buy " + strTitle }] };
                logger.debug("VOD PROMO" + JSON.stringify(vodpromo));
            }

            */

            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.attachment != null
                && subflow.facebook.attachment.payload != null
                && subflow.facebook.attachment.payload.elements != null) {

                try {

                    var pgms = subflow.facebook.attachment.payload.elements;
                    //logger.debug(" Is array? " + util.isArray(pgms))

                    if (!util.isArray(pgms)) {

                        subflow.facebook.attachment.payload.elements = [];
                        subflow.facebook.attachment.payload.elements.push(pgms);

                        //logger.debug("ProgramSearchCallBack=After=" + JSON.stringify(subflow) + " for interactionID  " + userCoversationArr.interactionid);

                    }
                } catch (err) { logger.debug("Error for interactionID " + userCoversationArr.interactionid + " on pgm search call back" + err); commonError(userCoversationArr, 'ufdres'); }
            }


            //to fix one button issue


            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.attachment != null
                && subflow.facebook.attachment.payload != null
                && subflow.facebook.attachment.payload.elements != null) {

                try {

                    var objlength = subflow.facebook.attachment.payload.elements.length;

                    for (var i = 0; i < objlength; i++) {

                        var elementsButton = subflow.facebook.attachment.payload.elements[i].buttons;

                        if (!util.isArray(elementsButton)) {
                            subflow.facebook.attachment.payload.elements[i].buttons = [];
                            subflow.facebook.attachment.payload.elements[i].buttons.push(elementsButton);
                        }
                    }

                    //logger.debug("Afer one button fix" + JSON.stringify(subflow) + " for interactionID  " + userCoversationArr.interactionid);


                } catch (err) { logger.debug("Error for interactionID " + userCoversationArr.interactionid + " on pgm search " + err); commonError(userCoversationArr, 'ufdres'); }
            }

            //fix to single element array 
            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.attachment != null
                && subflow.facebook.attachment.payload != null
                && subflow.facebook.attachment.payload.buttons != null) {

                try {

                    var pgms = subflow.facebook.attachment.payload.buttons;
                    //logger.debug("Is array? " + util.isArray(pgms))

                    vodpromo = '';

                    if (!util.isArray(pgms)) {

                        subflow.facebook.attachment.payload.buttons = [];
                        subflow.facebook.attachment.payload.buttons.push(pgms);
                        //logger.debug("ProgramSearchCallBack=After=" + JSON.stringify(subflow));
                    }
                } catch (err) { logger.error("Error for interactionID " + userCoversationArr.interactionid + "on pgm search " + err); commonError(userCoversationArr, 'ufdres'); }
            }

            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.text != null && subflow.facebook.text == 'UserNotFound') {
                //logger.debug("PGM Serach subflow " + subflow.facebook.text);

                subflow = {
                    "facebook": {
                        "attachment": {
                            "type": "template", "payload": {
                                "template_type": "generic", "elements": [
                                    {
                                        "title": "You have to Login to Verizon to proceed", "image_url": config.vzImage, "buttons": [
                                            {
                                                "type": "account_link",
                                                "url": config.AccountLink
                                            },
                                            {
                                                "type": "postback",
                                                "title": "Maybe later",
                                                "payload": "Main Menu"
                                            },
                                            {
                                                "type": "postback",
                                                "title": "More Options",
                                                "payload": "More Options"
                                            }]
                                    }]
                            }
                        }
                    }
                };

                // Need a session fix here
                var inputstr = "<isuserloggedin>no</isuserloggedin>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                            callback(null, data);

                            logger.debug('Update the userlogged in value to NO');
                        });
                    }
                }, function (err, results) {
                    logger.debug('Update the userlogged in value to NO');

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Update the userlogged in value to NO', sessionStartTime, sessionEndTime);
                });

                inputstr = "<searchneeded>yes</searchneeded>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest1", function (data) {

                            callback(null, data);

                            logger.debug('Update the search needed value to yes');
                        });
                    }
                }, function (err, results) {
                    logger.debug('Update the search needed value to yes');

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Update the search needed value to yes', sessionStartTime, sessionEndTime);
                });

                /*
                if (vodpromo != '')
                    merged_object = JSON.parse('{"attachment":' + JSON.stringify(subflow.facebook.attachment) + ',' + '"quick_replies":' + JSON.stringify(vodpromo.quick_replies) + '}');
                else
                    merged_object = subflow.facebook;

                logger.debug("Programsrc final resp" + JSON.stringify(merged_object));


                sendFBMessage(usersession, merged_object, userCoversationArr);
                */

                sendFBMessage(usersession, subflow.facebook, userCoversationArr);

            }
            else {

                /*
                logger.debug("adding vod promo2");

                if (vodpromo != '')
                    merged_object = JSON.parse('{"attachment":' + JSON.stringify(subflow.facebook.attachment) + ',' + '"quick_replies":' + JSON.stringify(vodpromo.quick_replies) + '}');
                else
                    merged_object = subflow.facebook;

                logger.debug("Programsrc final resp" + JSON.stringify(merged_object));

                sendFBMessage(usersession, merged_object, userCoversationArr);
                */

                //logger.debug("Programsrc final resp" + JSON.stringify(subflow.facebook));
                sendFBMessage(usersession, subflow.facebook, userCoversationArr);

            }

        }
        else {

            logger.debug("No response from UFD api call for pgmsearch callback  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }

    }
    catch (experr) {
        logger.error('error  for interactionID ' + userCoversationArr.interactionid + ' on  PgmSearchCallback : ' + experr);
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("PgmSearchCallback complted");
}

function recommendations(apireq, pgmtype, senderid, userCoversationArr, callback) {
    logger.debug('inside recommendations ');
    try {
        var args = {};
        if (pgmtype == "OnNow") {
            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        ThisValue: 'DSOnNow',
                        BotProviderId: senderid,
                        BotVCP: '3416',
                        BotTimeOffset: '5'
                    }
                }
            };
        }
        else {
            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        ThisValue: 'DSOnLater',
                        BotProviderId: senderid,
                        BotVCP: '3416',
                        BotTimeOffset: '5'
                    }
                }
            };

        }

        logger.debug("request args for recommendations " + JSON.stringify(args) + " for interactionID  " + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("response for recoomendations " + JSON.stringify(body));
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on posting the request for recommendations : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + '  on  recommendations : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug('inside recommendations completed ');
}

function recommendationsCallback(apiresp, senderid, userCoversationArr) {
    logger.debug('inside recommendationsCallback ');
    var objToJson = {};
    objToJson = apiresp;

    try {

        logger.debug("Response from recommendationsCallback " + JSON.stringify(apiresp) + " for interactionID " + userCoversationArr.interactionid);

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            //logger.debug("response for recommendation " + JSON.stringify(subflow));

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            var objlength = subflow.facebook.attachment.payload.elements.length;
            for (var i = 0; i < objlength; i++) {
                var elementsButton = subflow.facebook.attachment.payload.elements[i].buttons;
                if (!util.isArray(elementsButton)) {
                    subflow.facebook.attachment.payload.elements[i].buttons = [];
                    subflow.facebook.attachment.payload.elements[i].buttons.push(elementsButton);
                }
            }

            //logger.debug("Afer one button fix" + JSON.stringify(subflow) + " for interactionID " + userCoversationArr.interactionid);


            sendFBMessage(senderid, subflow.facebook, userCoversationArr);
        }
        else {

            logger.debug("No response from UFD for Recommendations call back  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }

    }
    catch (err) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' formating the response recommendations : ' + err);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug('inside recommendationsCallback completed ');
}

function RecordScenario(payloadresp, senderid, userCoversationArr) {
    logger.debug("inside RecordScenario");
    try {

        var time = payloadresp.formattedResponse.parameters.timeofpgm;
        var dateofrecord = payloadresp.formattedResponse.parameters.date;
        var SelectedSTB = payloadresp.formattedResponse.parameters.STBid;
        var time = payloadresp.formattedResponse.parameters.timeofpgm;

        logger.debug("SelectedSTB : " + SelectedSTB + " dateofrecord :" + dateofrecord + " time :" + time + " for interactionID " + userCoversationArr.interactionid);

        if (time == "") { //if time is empty show schedule
            //PgmSearch(apiresp, senderid, userCoversationArr, function (str) { PgmSearchCallback(str, senderid, userCoversationArr) });
            DSPgmSearch(payloadresp, senderid, userCoversationArr, function (str) { PgmSearchCallback(str, payloadresp, senderid, userCoversationArr) });
        }
        else if (SelectedSTB == "" || SelectedSTB == undefined) {
            STBList(payloadresp, senderid, userCoversationArr, function (str) { STBListCallBack(str, senderid, userCoversationArr) });
            //Read from session
        }
        else {  //Schedule Recording

            //logger.debug("Schedule Recording");

            /*logger.debug(" Channel: " + apiresp.result.parameters.Channel + " Programs: " + apiresp.result.parameters.Programs + " SelectedSTB: " + apiresp.result.parameters.SelectedSTB + " Duration: " + apiresp.result.parameters.Duration + " FiosId: " + apiresp.result.parameters.FiosId + " RegionId: " + apiresp.result.parameters.RegionId + " STBModel: " + apiresp.result.parameters.STBModel + " StationId: " + apiresp.result.parameters.StationId + " date: " + apiresp.result.parameters.date + " timeofpgm: " + apiresp.result.parameters.timeofpgm);*/

            var sessionStartTime = getDateTime();
            var sessionEndTime;


            async.series({
                recorddetails: function (callback) {
                    var xVal = updateAndGetSession(senderid, "", "recorddetails", "BotRequest1", function (data) {
                        callback(null, data);
                        logger.debug('CallBack RecordDetails updateAndGetSession_1');
                    });
                }

            }, function (err, results) {
                var recordetails = results.recorddetails;
                logger.debug('Recorddetails in schedule recording ' + recordetails);

                sessionEndTime = getDateTime();
                getsecondstaken('session for retrieving record details ', sessionStartTime, sessionEndTime);

                DVRRecord(payloadresp, senderid, userCoversationArr, recordetails, function (str) { DVRRecordCallbackWithMsg(str, senderid, userCoversationArr, recordetails) });
            });
        }
    }
    catch (experr) {
        logger.debug('error for interactionID ' + userCoversationArr.interactionid + '  on  RecordScenario : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug("inside RecordScenario completed");
}

function STBList(apireq, senderid, userCoversationArr, callback) {

    logger.debug("inside STBList");

    try {
        var args = {
            json: {
                Flow: config.FlowName,
                Request: {
                    ThisValue: 'AuthSTBList', //'AuthSTBList',
                    BotProviderId: senderid,
                    Userid: ''
                }
            }
        };

        logger.debug('Request of STB List ' + JSON.stringify(args) + ' for interactionID ' + userCoversationArr.interactionid);

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json

        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {


                callback(body);
            }
            else {

                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on posting the stb list request : ' + error + ' body: ' + JSON.stringify(body));
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  STBList : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }
    logger.debug("inside STBList completd");
}

function STBListCallBack(apiresp, senderid, userCoversationArr) {
    var objToJson = {};
    objToJson = apiresp;
    try {

        logger.debug("Response from stblistcallback for interactionID  " + userCoversationArr.interactionid  + " in " + JSON.stringify(objToJson));

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;
            //logger.debug("STBListCallBack=before=" + JSON.stringify(subflow));

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            //fix to single element array 
            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.attachment != null
                && subflow.facebook.attachment.payload != null
                && subflow.facebook.attachment.payload.buttons != null) {

                try {
                    var pgms = subflow.facebook.attachment.payload.buttons;

                    if (!util.isArray(pgms)) {

                        //sendFBMessage(senderid, { text: "We are processing..." }, userCoversationArr);

                        var payload2 = subflow.facebook.attachment.payload.buttons.payload;
                        //logger.debug("before event");
                        var event = {
                            "sender": {
                                "id": userCoversationArr.senderid
                            },
                            "recipient": {
                                "id": userCoversationArr.receipentid
                            },
                            "timestamp": userCoversationArr.timestamp,
                            "message": {
                                "mid": userCoversationArr.messageid,
                                "text": payload2
                            }
                        };
                        //logger.debug("after event  " + JSON.stringify(event));
                        logger.debug("Completed STBListCallBack");
                        processEvent(event, userCoversationArr);

                        return;
                    }
                } catch (err) { logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on stblistcallback - array ' + err); commonError(userCoversationArr, 'ufdres'); }
            }

            // Fix for User Not Found

            if (subflow != null
                && subflow.facebook != null
                && subflow.facebook.text != null && subflow.facebook.text == 'UserNotFound') {
                //logger.debug("Stb list call back - User Not Found " + subflow.facebook.text);

                subflow = {
                    "facebook": {
                        "attachment": {
                            "type": "template", "payload": {
                                "template_type": "generic", "elements": [
                                    {
                                        "title": "You have to Login to Verizon to proceed", "image_url": config.vzImage, "buttons": [
                                            {
                                                "type": "account_link",
                                                "url": config.AccountLink
                                            },
                                            {
                                                "type": "postback",
                                                "title": "Maybe later",
                                                "payload": "Main Menu"
                                            },
                                            {
                                                "type": "postback",
                                                "title": "More Options",
                                                "payload": "More Options"
                                            }]
                                    }]
                            }
                        }
                    }
                };

                // Need a session fix here
                var inputstr = "<isuserloggedin>no</isuserloggedin>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest2", function (data) {

                            callback(null, data);

                            logger.debug('Update the userlogged in value to NO');
                        });
                    }
                }, function (err, results) {
                    logger.debug('Update the userlogged in value to NO');

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Update the userlogged in value to NO', sessionStartTime, sessionEndTime);

                });

                inputstr = "<recordneeded>yes</recordneeded>";

                var sessionStartTime = getDateTime();
                var sessionEndTime;

                async.series({
                    one: function (callback) {
                        var xVal = updateAndGetSession(userCoversationArr.senderid, inputstr, "", "BotRequest1", function (data) {

                            callback(null, data);

                            logger.debug('Update the record needed value to yes in callback');
                        });
                    }
                }, function (err, results) {
                    logger.debug('Update the record needed value to yes in results');

                    sessionEndTime = getDateTime();
                    getsecondstaken('session for Update the record needed value to yes in results', sessionStartTime, sessionEndTime);
                });


                sendFBMessage(senderid, subflow.facebook, userCoversationArr);
                return;

            }

            sendFBMessage(senderid, subflow.facebook, userCoversationArr);

        }
        else {
            logger.debug("No response from UFD api call for getting stb list information  for interactionID " + userCoversationArr.interactionid);
            commonError(userCoversationArr, 'ufdres');
        }
    }
    catch (experr) {
        logger.debug('error for interactionID ' + userCoversationArr.interactionid + ' on  STBList callback: ' + experr);
        commonError(userCoversationArr, 'ufdres');
    }

    logger.debug("Completed STBListCallBack");
}

function DVRRecord(apireq, senderid, userCoversationArr, recorddetails, callback) {

    logger.debug("<<< Inside DVRRecord function >>>");
    try {
        var strUserid = '';
        var args = {};

        var strRegionId = apireq.formattedResponse.parameters.RegionId;
        var strSTBModel = apireq.formattedResponse.parameters.STBModel;
        var strSTBId = apireq.formattedResponse.parameters.STBid;
        var strVhoId = apireq.formattedResponse.parameters.VhoId;
        var strProviderId = apireq.formattedResponse.parameters.ProviderId;


        ////[Start] Read from Session to see the STB Details are available

        //var recorddetails = updateAndGetSession(senderid, "", "recorddetails", "BotRequest1");
        //logger.debug("Record Details from session for Sender " + senderid + " " + recorddetails);

        //// [End] Read from Session to see the STB Details are available 

        var formattedResponse = NLPresponseFormatter("custom", recorddetails);
        //logger.debug('payloadmessage:::: for interactionID ' + userCoversationArr.interactionid + ' formatted response ' + JSONbig.stringify(formattedResponse));

        var strProgram = formattedResponse.formattedResponse.parameters.Program;
        var strChannelName = formattedResponse.formattedResponse.parameters.Channel;
        var strGenre = formattedResponse.formattedResponse.parameters.Genre;

        var strFiosId = formattedResponse.formattedResponse.parameters.FiosId;
        var strSeriesId = formattedResponse.formattedResponse.parameters.SeriesId;
        var strStationId = formattedResponse.formattedResponse.parameters.StationId;

        var strAirDate = formattedResponse.formattedResponse.parameters.Date;
        var strAirTime = formattedResponse.formattedResponse.parameters.Time;
        var strDuration = formattedResponse.formattedResponse.parameters.Duration;

        //logger.debug(" recording details for interactionID  " + userCoversationArr.interactionid +  " strUserid " + strUserid + "Recording strProgram " + strProgram + " strGenre " + strGenre + " strdate " + strAirDate + " strFiosId " + strFiosId + " strSeriesId " + strSeriesId + " strStationId " + strStationId + " strAirDate " + strAirDate + " strAirTime " + strAirTime + " strSTBId " + strSTBId + " strSTBModel " + strSTBModel + " strRegionId " + strRegionId + " strDuration " + strDuration);

        if (strDuration == undefined || strDuration == '') {
            //logger.debug("durationcheck   : " + strDuration);
            strDuration = '60';
        }

        if (strSeriesId != '' && strSeriesId != undefined) {
            //logger.debug("Record Series");

            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        ThisValue: 'AuthRecordSeriesWithMsg',  //DVRSeriesSchedule
                        Userid: '',
                        BotStbId: strSTBId,
                        BotDeviceModel: strSTBModel,
                        BotstrFIOSRegionID: '',
                        BotstrFIOSID: strFiosId,
                        BotstrSeriesId: strSeriesId, //yes its series id
                        BotStationId: strStationId,
                        BotAirDate: strAirDate,
                        BotAirTime: strAirTime,
                        BotDuration: strDuration,
                        BotstrTitleValue: strProgram,
                        BotVhoId: strVhoId,
                        BotProviderId: senderid, //yes sender id
                        BotstrFIOSRegionID: strRegionId
                    }
                }

            };
        }
        else {
            //logger.debug("Record Episode");
            args = {
                json: {
                    Flow: config.FlowName,
                    Request: {
                        ThisValue: 'AuthRecordShowWithMsg',//WithMsg
                        Userid: '',
                        BotStbId: strSTBId,
                        BotDeviceModel: strSTBModel,
                        BotstrFIOSRegionID: '',
                        BotstrFIOSServiceId: strFiosId,
                        BotStationId: strStationId,
                        BotAirDate: strAirDate,
                        BotAirTime: strAirTime,
                        BotDuration: strDuration,
                        BotVhoId: strVhoId,
                        BotProviderId: senderid
                    }
                }
            };
        }

        logger.debug("Request for interactionID  " + userCoversationArr.interactionid +  " dvr record args " + JSON.stringify(args));

        request({
            url: config.UFD_rest_api,
            proxy: config.vz_proxy,
            headers: config.headersInfo,
            method: 'POST',
            json: args.json

        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {

                //logger.debug("body " + body);
                callback(body);
            }
            else {
                logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on DVR Record: ' + error + ' body: ' + body);
                commonError(userCoversationArr, 'ufdreq');
            }
        });
    }
    catch (experr) {
        logger.debug('error  for interactionID ' + userCoversationArr.interactionid + ' on  DVRRecord : ' + experr);
        commonError(userCoversationArr, 'ufdreq');
    }

    logger.debug("<<< Inside DVRRecord function complted >>>");
}

function DVRRecordCallbackWithMsg(apiresp, senderid, userCoversationArr, recorddetails) {
	logger.debug("inside dvrrecordcallback")
    var objToJson = {};
    objToJson = apiresp;
    try {

        
        logger.debug("response from dvr record call back " + JSON.stringify(apiresp) + "for interaction ID " + userCoversationArr.interactionid)

        if ((objToJson != null) &&
            (objToJson[0].Inputs != null) &&
            (objToJson[0].Inputs.newTemp != null) &&
            (objToJson[0].Inputs.newTemp.Section.Inputs.Response != null)) {

            var subflow = objToJson[0].Inputs.newTemp.Section.Inputs.Response;

            userCoversationArr.ufdresdatetime = getDateTime();
            userCoversationArr.ufdTimeTaken = getsecondstaken('ufd', userCoversationArr.ufdreqdatetime, userCoversationArr.ufdresdatetime);
            userCoversationArr.ufdreq = 'passed';
            printChatHistory(userCoversationArr);

            //logger.debug("subflow Value  for interactionID " + userCoversationArr.interactionid + " ----- " + JSON.stringify(subflow));

            //Read from Session for sending to mail
            //var recorddetails = updateAndGetSession(userCoversationArr.senderid, "", "recorddetails", "BotRequest1");

            var respobj = {};
            if (subflow != null) {
                if (subflow != null && subflow.facebook != null && subflow.facebook.msg != null && subflow.facebook.msg == "success") {
                    sendFBMessage(senderid, subflow.facebook.result, userCoversationArr);
                    userCoversationArr.isrecorded = 'yes';
                }
                else if (subflow != null && subflow.facebook != null && subflow.facebook.code != null && subflow.facebook.code == "9507") {

                    sendNotification(false, true, "DVR Record", recorddetails, '', '', userCoversationArr.senderid, '', userCoversationArr.intent, userCoversationArr.action, JSON.stringify(subflow), '');
                    userCoversationArr.isrecorded = '9507';
                    sendFBMessage(senderid, { text: subflow.facebook.result.text }, userCoversationArr);
                }
                else if (subflow != null && subflow.facebook != null && subflow.facebook.code != null && subflow.facebook.code == "9117") {

                    sendNotification(false, true, "DVR Record", recorddetails, '', '', userCoversationArr.senderid, '', userCoversationArr.intent, userCoversationArr.action, JSON.stringify(subflow), '');
                    userCoversationArr.isrecorded = '9117';
                    sendFBMessage(senderid, subflow.facebook.result, userCoversationArr);
                }
                else if (subflow != null && subflow.facebook != null && subflow.facebook.errorPage != null && subflow.facebook.errorPage.errormsg != null) {

                    sendNotification(false, true, "DVR Record", recorddetails, '', '', userCoversationArr.senderid, '', userCoversationArr.intent, userCoversationArr.action, JSON.stringify(subflow), '');
                    userCoversationArr.isrecorded = 'error';
                    //logger.debug("Error  for interactionID " + userCoversationArr.interactionid + " while recording Error Message :" + subflow.facebook.errorPage.errormsg);
                    sendFBMessage(senderid, { text: subflow.facebook.errorPage.errormsg }, userCoversationArr);
                }
                else {

                    sendNotification(false, true, "DVR Record", recorddetails, '', '', userCoversationArr.senderid, '', userCoversationArr.intent, userCoversationArr.action, JSON.stringify(subflow), '');
                    userCoversationArr.isrecorded = 'error';
                    //logger.debug("Error  for interactionID " + userCoversationArr.interactionid + " while recording :" + subflow.facebook.result.text);
                    sendFBMessage(senderid, { text: subflow.facebook.result.text }, userCoversationArr);
                }
            }

        }
        else {

            logger.debug("No response from UFD api call for recording information  for interactionID " + userCoversationArr.interactionid);
            userCoversationArr.isrecorded = 'error';
            commonError(userCoversationArr, 'ufdres');
        }

    }
    catch (err) {
        logger.debug("Error  for interactionID " + userCoversationArr.interactionid + "  for interactionID ' + userCoversationArr.interactionid + ' occured in recording: " + err);
        respobj = "Yikes, looks like something went wrong with this recording. Do me a favor and try again later.";

        var catch_error = "Error in recording method " + err;
        sendNotification(false, true, "DVR Record", recorddetails, '', '', userCoversationArr.senderid, '', userCoversationArr.intent, userCoversationArr.action, catch_error, '');

        userCoversationArr.isrecorded = 'error';
        sendFBMessage(senderid, { text: respobj }, userCoversationArr);
    }
}
