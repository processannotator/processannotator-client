'use strict' /*eslint global-strict:0*/

require('electron-compile').init() // to compile to ES6/harmony

var app = require('app') // Module to control application life.
var ipc = require('ipc') // module for interprocess communication (renderer <-> backend)
var BrowserWindow = require('browser-window') // Module to create native browser window.
var socket = require('socket.io-client')('http://localhost:3000/DokuClients')


// Report crashes to our server.
require('crash-reporter').start()

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null

// Quit when all windows are closed.
app.on('window-all-closed', function() {
	// On OS X it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') {
		app.quit()
	}
})




app.on('ready', function() {

	mainWindow = new BrowserWindow({
		width: 800,
		height: 600
	})

	// load the index.html of the app.
	mainWindow.loadUrl('file://' + __dirname + '/index.html')

	// Open the devtools.
	mainWindow.openDevTools()

	socket.on('connect', function() {
		console.log('Connected to socket server')

		socket.on('disconnect', function() {
			console.log('Disconnected from server')
		})

	})

	mainWindow.on('closed', function() {
		// Dereference the window object, usually you would store windows
		// in an array if your app supports multi windows, this is the time
		// when you should delete the corresponding element.
		mainWindow = null
	})
})