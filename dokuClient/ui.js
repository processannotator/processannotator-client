/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
var PouchDB = require('pouchdb')
var localDB = new PouchDB('annotations')
var remoteDB = new PouchDB('http://127.0.0.1:5984/annotations')


localDB.changes({
	since: 'now',
	live: true,
	include_docs: true
}).on('change', function(change) {
	// handle change
	console.log('chchachange');
	console.log(JSON.stringify(change));
}).on('complete', function(info) {
	console.log('change complete');
	// changes() was canceled
}).on('error', function (err) {
	console.log(err);
});

remoteDB.changes({
	since: 'now',
	live: true,
	include_docs: true
}).on('change', function(change) {
	// handle change
	console.log('change');
}).on('complete', function(info) {
	console.log('change complete');
	// changes() was canceled
}).on('error', function (err) {
	console.log(err);
});




var alertOnlineStatus = function() {
	window.alert(navigator.onLine ? 'online' : 'offline')
}

window.addEventListener('online', alertOnlineStatus)
window.addEventListener('offline', alertOnlineStatus)

var sync = PouchDB.sync(localDB, remoteDB, {
  live: true,
  retry: true
}).on('change', function (info) {
  // handle change
	console.log('sync change')
}).on('paused', function () {
	console.log('sync pause')

  // replication paused (e.g. user went offline)
}).on('active', function () {
	console.log('sync active')

  // replicate resumed (e.g. user went back online)
}).on('denied', function (info) {
	console.log('sync denied')

  // a document failed to replicate, e.g. due to permissions
}).on('complete', function (info) {
	console.log('sync complete')
  // handle complete
}).on('error', function (err) {
	console.log('sync error')

  // handle error
});


// ipc.on('annotation_with_image', function(annotation, status) {
// 	console.log('annotation with image arrived')
// 		// let img = new Image()
// 	let imgContainer = document.querySelector('.imageContainer')
// 	let img = imgContainer.querySelector('img')
// 	img.src = 'data:image/jpg;base64,' + annotation.image
//
// 	let overlay = document.createElement('div')
// 	overlay.style.position = 'absolute'
// 	overlay.style.left = annotation.position[0] + 'px'
// 	overlay.style.top = annotation.position[1] + 'px'
// 	overlay.innerHTML = annotation.description
// 	overlay.contentEditable = true
//
// 	let audio = document.createElement('audio')
// 		// audio.src = 'test.wav'
//
// 	overlay.addEventListener('mouseover', function(e) {
// 		audio.play()
// 	})
// 	overlay.addEventListener('mouseout', function(e) {
// 		audio.pause()
// 	})
//
// 	overlay.appendChild(audio)
//
// 	overlay.addEventListener('input', function(e) {
// 		console.log('annotation changed')
// 		console.log(e)
// 			// probably use a MVC lib here (angular?, react)
// 			// ipc.send('annotation_changed', {id:1, newAnnotation: })
// 	})
// 	imgContainer.appendChild(overlay)
//
// })

alertOnlineStatus()