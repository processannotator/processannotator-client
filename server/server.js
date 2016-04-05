'use strict'

var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({ port: 7000 });

let nano = require('nano')('http://couchadmin:thisisacouchdbpassword@localhost:5984');
let users = nano.use('_users');
let auth;

// Check for new users: if they got the dev key, add the role 'testuser'.
var listenForNewUsers = function () {
  console.log('Listen for new users.');

  var feed = users.follow({since: 'now', include_docs: true, filter: isNewTestUsers});
  feed.on('change', function (change) {
    // Add new role to user.
    change.doc.roles.push('testuser');
    users.insert(change.doc);
  });
  feed.follow();
  process.nextTick(function () {
  });

  function isNewTestUsers(doc, req) {
    // filter out already verified testusers (has testuser role) and invalid users (that include no valid testKey)
    return (doc.testkey && doc.testkey === 'testuserkey' && doc.roles.length === 0);
  }

};

var createDB = function (message) {
  return new Promise((resolve, reject) => {

    nano.db.create(message.projectname, function (err__, body__) {
      console.log('ok, got some response…');
      if(!err__) {
        console.log('database created!');
        resolve(body__);
      } else {
        console.log(err__);
        reject(err__);
      }
    });

    console.log('user is %s and has these roles: %j', session.userCtx.name, session.userCtx.roles);
  });
};

  wss.on('connection', function connection(ws) {
    console.log('new connection');

    ws.on('message', function incoming(rawmessage) {
      console.log('received: %s', rawmessage);
      let message = JSON.parse(rawmessage);

      // handle different messages
      switch (message.type) {
        case 'createDB':
        let response = {type: 'createDB', projectname: message.projectname};

        createDB(message).then(result => {
          response.successful = true;
          ws.send(JSON.stringify(response));
        }).catch(err => {
          response.successful = false;
          ws.send(JSON.stringify(response));
        });
        break;
        default:

      }


    });


  });



listenForNewUsers();
