'use strict'



var WebSocketServer = require('ws').Server
, wss = new WebSocketServer({ port: 7000 });

let nano = require('nano')('http://localhost:5984')
let auth




var createDB = function (details) {
  console.log('now create the db')
  return new Promise((resolve, reject) => {

    console.log('blaaa')
    let nano2 = require('nano')({url: 'http://localhost:5984', cookie: auth})
    console.log('blaaa2')

    nano2.session(function(err, session) {
      console.log('test');
      if (err) {
        return console.log('oh noes!')
      }
      console.log('user is %s and has these roles: %j', session.userCtx.name, session.userCtx.roles);
    })
      console.log('foobar')

      nano2.db.create(details.projectname, function (err_, body_) {
        console.log('hmmmmmm, some response?')
        if(!err_) {
          console.log('database created!')
          resolve(body_)
        } else {
          console.log(err_)
          reject(err_)
        }
      })



    })

  }




nano.auth('tom', '***REMOVED***', function (err, body, headers) {

  if (err) {
    console.log(err)
    reject(err)
  }

  console.log('authenticated')
  console.log(body, headers)

  if (headers && headers['set-cookie']) {
    auth = headers['set-cookie']
  }
  createDB({bla:'bla'})

})





  wss.on('connection', function connection(ws) {
    console.log('new connection')

    ws.on('message', function incoming(rawmessage) {
      console.log('received: %s', rawmessage)
      let message = JSON.parse(rawmessage)

      // handle different messages
      switch (message.type) {
        case 'createDB':

        createDB(message.details).then((result) => {
          let response =
          {
            type: 'createDB',
            details: {
              successful: true
            }
          }

          // respond
          ws.send(JSON.stringify(response))
        })


        break;
        default:

      }


    });


  });
