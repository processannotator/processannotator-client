/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
var PouchDB = require('pouchdb')
var localDB = new PouchDB('annotations')
var remoteDB = new PouchDB('http://127.0.0.1:5984/annotations')

var annotations

// DOM elements
var imageContainer

function rebuildUI() {
	imageContainer = document.querySelector('.imageContainer')
	var overlays = imageContainer.querySelectorAll('.annotationOverlay')
	// in chrome45/electron 0.32: Array.from(imageContainer.querySelectorAll('.annotationOverlay'))

	// first clean old overlays
	for (var i = 0; i < overlays.length; i++) {
		imageContainer.removeChild(overlays[i])
	}
	
	// ES6 object destructuring comes really handy here!
	// see: https://leanpub.com/understandinges6/read#leanpub-auto-object-destructuring
	// console.log(annotations)
	for (let {doc: {name, description, position, _id, _attachments}} of annotations) {
		let overlay = document.createElement('div')
		overlay.classList.add('annotationOverlay')
		if(position[0] === undefined) console.log(doc)
		overlay.style.position = 'absolute'
		overlay.style.left = position[0] + 'px'
		overlay.style.top = position[1] + 'px'
		overlay.innerHTML = description
		overlay.contentEditable = true
		overlay.id = _id
overlay.addEventListener('blur', function({target: {id, innerHTML}}) {
	
	// update document in localDB
	localDB.get(id).then(doc => {
		console.log('log doc')
		console.log(doc)
		return localDB.put({
			_id: id,
			_rev: doc._rev,
			description: innerHTML,
			position: doc.position,
			name: doc.name,
			_annotations: doc._annotations
		})
	}).then(response => {
		console.log(response)
		// handle response
	}).catch(err => {
		console.log(err)
	})


})

		imageContainer.appendChild(overlay)
	}

}

function fetchAnnotations() {

	return remoteDB.allDocs({
		include_docs: true,
		attachments: true

	}).then(result => {
		annotations = result.rows

	}).catch(err => {
		console.error(err)
	})
}


var alertOnlineStatus = function() {
	window.alert(navigator.onLine ? 'online' : 'offline')
}

window.addEventListener('online', alertOnlineStatus)
window.addEventListener('offline', alertOnlineStatus)

var sync = PouchDB.sync(localDB, remoteDB, {
  live: true,
  retry: true
}).on('change', function (info) {

	// only rebuild UI if there are changes after a pull from remoteDB
	if(info.direction === 'pull' && info.change.docs.length !== 0) {
		fetchAnnotations().then(() => {rebuildUI()})
	}

}).on('paused', () => {
	console.log('sync pause')

  // replication paused (e.g. user went offline)
}).on('active', () => {
	console.log('sync active')

  // replicate resumed (e.g. user went back online)
}).on('denied', info => {
	console.log('sync denied')

  // a document failed to replicate, e.g. due to permissions
}).on('complete', info => {
	console.log('sync complete')
  // handle complete
}).on('error', err => {
	console.log('sync error')

  // handle error
})

function init() {
	localDB.changes({
		since: 'now',
		live: true,
		include_docs: true

	}).on('change', change => {

	}).on('complete', info => {

	}).on('error', err => {
		console.error(err)
	})

	fetchAnnotations().then(() => rebuildUI())

}

init()







/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////



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