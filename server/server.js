// google speech api key: AIzaSyB6Wgr15OViZNoFwAe3NNwCjBjM0kR-iGQ

var fs = require('fs')
var express = require('express')
var app = express()
app.use(express.static('public'))
var PouchDB = require('pouchdb')
var http = require('http').Server(app)
var io = require('socket.io')(http)
var speech = require('google-speech-api')

var db = new PouchDB('http://127.0.0.1:5984/collabDB')
db.changes().then(function(a) {
	console.log('change local')
}).catch(function(err) {
	console.log(err)
})

// socket.io inits
var DokuClients = io.of('/DokuClients')
var CameraClients = io.of('/CameraClients')

function handleConnection(socket) {
	console.log('a user connected')

	socket.on('disconnect', () => console.log('user disconnected'))


	socket.on('annotation_with_image', function(name, x, y, imageBuffer, audioBuffer) {
		// TODO: put annotation in DB even if image or audio not valid or nonexistend

		if (Buffer.isBuffer(imageBuffer)) {

			fs.writeFile('test.jpg', imageBuffer, 'binary', function(err) {
				if (err) {
					console.log(err)
				} else {
					console.log('The file was saved!')
				}
			})

		} else {
			console.log('received image is not valid (not a Buffer). discard.')
		}

		if (Buffer.isBuffer(audioBuffer)) {
			fs.writeFile('testaudio.ogg', audioBuffer, 'binary', function(err) {
				if (err) {
					console.log(err)
				} else {
					console.log('The audio file was saved!')
					var opts = {
						file: 'testaudio.ogg',
						key: 'AIzaSyB6Wgr15OViZNoFwAe3NNwCjBjM0kR-iGQ'
					}

					speech(opts, (error, results) => {
						// put annotation into DB

						var annotation = {
							'_id': new Date().toISOString(),
							'name': name,
							'description': (error === undefined && results !== undefined && results[0].result.length > 0) ? results[0].result[0].alternative[0].transcript : JSON.stringify(results),
							'position': [parseInt(x), parseInt(y)],
							'_attachments': {
								'image.jpg': {
									'content_type': 'image/jpg',
									'data': imageBuffer.toString('base64')
								},
								'speech.ogg': {
									'content_type': 'audio/ogg',
									'data': audioBuffer.toString('base64')
								}
							}
						}

						console.log('put annotation into DB')
						db.put(annotation)
					})
				}
			})

		} else {
			console.log('received audio is not valid (not a Buffer). discard.')
		}

	})







}




http.listen(3000, function() {
	console.log('listening on *:3000')
})


// only listen for Camera clients
io.on('connection', handleConnection)
