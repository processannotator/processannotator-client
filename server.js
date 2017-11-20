'use strict';
const express = require('express');
const app = express();
const watson = require('watson-developer-cloud');
const vcapServices = require('vcap_services');
var extend = (extend = require('util')._extend);

const SST_ENABLED = true;
const port = 8080;

// For local development, replace username and password or set env properties
let sttConfig = extend(
  {
    version: 'v1',
    url: 'https://stream.watsonplatform.net/speech-to-text/api',
    // Supply your Watson/IBM STT credentials via ENV variables
    // (https://nodejs.org/api/process.html#process_process_env)
    // are put them directly here.
    username: process.env.STT_USERNAME || 'yourusername',
    password: process.env.STT_PASSWORD || 'yourpassword'
  },
  vcapServices.getCredentials('speech_to_text')
);

let sttAuthService = watson.authorization(sttConfig);

function handleSTT(req, res) {
  console.log('getSpeechToTextToken');

  if(SST_ENABLED === false) {
    event.returnValue = undefined;
  } else {
    sttAuthService.getToken({ url: sttConfig.url }, function(err, token) {
      if (err) {
        console.error('Error retrieving token: ', err);
        return;
      } else {
        res.send(token);
      }
    });
  }

  };


app.use(express.static(__dirname));
app.get('/api/speech-to-text/token', handleSTT);





  app.listen(port, function() {
  console.log('Server live at http://localhost:%s/', port);
});
