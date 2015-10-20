/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
var PouchDB = require('pouchdb')
var localDB = new PouchDB('annotations')
var remoteDB = new PouchDB('http://127.0.0.1:5984/annotations')
var sync

var annotationElements = new Map()

// DOM elements
var imageContainer
var annotationList
var renderView


function removeAnnotationElements(id) {
	// get DOM objects belonging to id
	let [annotationBox] = annotationElements.get(id)
	// annotationPoint.parentNode.removeChild(annotationPoint)
	annotationBox.parentNode.removeChild(annotationBox)
}


function addAnnotationElements({doc: {name, description, position, _id, _attachments}}){
	// add both, annotation box and annotation point to DOM
	// only handle creation of DOM element, actual DB updates
	// are done independently

	let annotationBox = document.createElement('annotation-box')
	annotationBox.annotationText = description
	annotationBox.timestamp = _id
	annotationBox._id = _id

	if (position[0] === undefined) {
		throw Error('position[0] === undefined', doc)
	}
	
	// annotationPoint.addEventListener('blur', function({target: {id, innerHTML}}) {
	//
	// 	// TODO: move this event listener to the web components code later
	// 	// update document in localDB
	// 	localDB.get(id).then(doc => {
	//
	// 		return localDB.put({
	// 			_id: id,
	// 			_rev: doc._rev,
	// 			description: innerHTML,
	// 			position: doc.position,
	// 			name: doc.name
	// 		})
	//
	// 	}).then(response => {
	// 		console.log(response)
	// 	}).catch(err => {
	// 		console.log(err)
	// 	})
	//
	// })

	annotationList.appendChild(annotationBox)
	annotationElements.set(_id, [/*annotationPoint,*/ annotationBox])
}


function fetchAnnotations() {

	return remoteDB.allDocs({
		include_docs: true,
		attachments: true
	})
	.then(result => result.rows)
	.catch(err => {
		console.error(err)
	})
}

function rebuildAnnotationElements() {
	// this function removes all created representations for annotations
	// and re-creates and appends them to the view

		return fetchAnnotations().then( function(annotations) {

			// first clean old annotation elements
			for (let id of annotationElements.keys()) {
				removeAnnotationElements(id)
			}

			// then add new annotation elements to the list
			// FIXME: outsource this to the annotationlist element
			for (let annotation of annotations) {
				addAnnotationElements(annotation)
			}
			
			// update the renderView with new annotation
			if(renderView)
				renderView.annotations = annotations
			
			
		})
}




var alertOnlineStatus = function() {
	// window.alert(navigator.onLine ? 'online' : 'offline')
}

function handleResize(event) {
	if(renderView) {
		renderView.resize()
	}
}

window.addEventListener('online', alertOnlineStatus)
window.addEventListener('offline', alertOnlineStatus)
window.addEventListener('resize', handleResize)


function init() {


	imageContainer = document.querySelector('.object-view')
	annotationList = document.querySelector('.annotation-list')
	renderView = document.querySelector('render-view')

	localDB.changes({
		since: 'now',
		live: true,
		include_docs: true

	}).on('change', info => {

		// only rebuild UI if there are changes after a pull from remoteDB
		if (info.direction === 'pull' && info.change.docs.length !== 0) {
			// console.log(info)
			// FIXME: instead of completely rebuilding
			// just delete/modifiy/add the ones that changed

			// go through all changes
			// trigger delete actions and edit/actions
			// for (let annotation of info.change.docs) {
			// 	console.log(annotation)
			// 		if(annotation._deleted === true){
			// 				let
			// 		} else {
			//
			// 		}
			// }
		}
	}).on('complete', info => {

	}).on('error', err => {
		console.log("FOOOOO")
		// console.error(err)
	}).on('pause', err => {
		console.log('pause')
	})


	sync = PouchDB.sync(localDB, remoteDB, {
		live: true,
		retry: true
	}).on('change', function(info) {
		console.log('change!!')
		console.log('TODO: now sync all DOM elements...')
		rebuildAnnotationElements()


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

	rebuildAnnotationElements()

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
// 	let annotationPoint = document.createElement('div')
// 	annotationPoint.style.position = 'absolute'
// 	annotationPoint.style.left = annotation.position[0] + 'px'
// 	annotationPoint.style.top = annotation.position[1] + 'px'
// 	annotationPoint.innerHTML = annotation.description
// 	annotationPoint.contentEditable = true
//
// 	let audio = document.createElement('audio')
// 		// audio.src = 'test.wav'
//
// 	annotationPoint.addEventListener('mouseover', function(e) {
// 		audio.play()
// 	})
// 	annotationPoint.addEventListener('mouseout', function(e) {
// 		audio.pause()
// 	})
//
// 	annotationPoint.appendChild(audio)
//
// 	annotationPoint.addEventListener('input', function(e) {
// 		console.log('annotation changed')
// 		console.log(e)
// 			// probably use a MVC lib here (angular?, react)
// 			// ipc.send('annotation_changed', {id:1, newAnnotation: })
// 	})
// 	imgContainer.appendChild(annotationPoint)
//
// })

