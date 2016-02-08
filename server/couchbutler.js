var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({ port: 7000 });

wss.on('connection', function connection(ws) {
  console.log('new connection');
  ws.on('message', function incoming(message) {
    console.log('received: %s', message);
  });

  ws.send('something');
});
