/* eslint no-alert:0*/
'use strict' /*eslint global-strict:0*/

var ipc = require('ipc')
var PouchDB = require('pouchdb')
var localDB = new PouchDB('collabdb')
var remoteDB = new PouchDB('http://127.0.0.1:5984/collabdb')
var sync

var annotationElements = new Map()

// DOM elements
var imageContainer
var annotationList
var renderView
var activeProfile = {_id: 'profile_1'}
var activeProject = {_id: 'project_1'}
var activeTopic = {_id: 'topic_1'}

function addProject(file) {
	// first create DB entry for new project
	// then create a new topic from file/.. which belongs to the newly created project
	return localDB.put({
		_id: 'project_' + 1,
		type: 'project',
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a project title',
		description: 'a description to a project'
	})
	.then(localDB.get('project' + 1))
	.then((newProject) => {
		activeProject = newProject
		return addNewTopic(file)
	})
	// finally return the new projects object
	.then(() => activeProject)
	.catch((err) => {
		console.error('error creating new project in DB', err)
	})


}

function addTopic() {
	// add new topic to active project
	return localDB.put({
		_id: 'topic_' + 1,
		type: 'topic',
		parentProject: activeProject._id,
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: 'a description to a topic'
	})
}

function addAnnotation({description='', position={x: 0 , y: 0, z: 0}, polygon=[]}) {
	let annotation = {
		_id: 'annotation_' + new Date().toISOString(),
		type: 'annotation',
		parentProject: activeProject._id,
		parentTopic: activeTopic._id,
		creator: activeProfile._id,
		creationDate: new Date().toISOString(),
		title: 'a topic title',
		description: description,
		position: position,
		polygon: polygon
	}

	console.log('put annotation into DB')
	console.log(annotation)
	return localDB.put(annotation)
}

function savePreferences() {
	db.put({
	  _id: '_local/lastSession',
	  activeProfile: activeProfile,
		activeProject: activeProject,
		activeTopic: activeTopic
	})
}

function setNewProfile({username, email, color}) {

	db.put({
		_id: 'profile_' + 1,
		type: 'userProfile',
		username: username,
		email: email,
		color: color,
		creationDate: new Date().toISOString()
	})
}


function removeAnnotationElements(id) {
	// get DOM objects belonging to id
	let [annotationBox] = annotationElements.get(id)
	// annotationPoint.parentNode.removeChild(annotationPoint)
	annotationBox.parentNode.removeChild(annotationBox)
}


function addElementsForAnnotation(annotation){
	// add both, annotation box and annotation point to DOM
	// only handle creation of DOM element, actual DB updates
	// are done independently
	// TODO: also create 3D Labels here??
	let doc = annotation.doc
	let {name, description, position, _id, _attachments} = doc
	console.log(doc)
	let annotationBox = document.createElement('annotation-box')
	annotationBox.annotationText = description
	annotationBox.timestamp = _id
	annotationBox._id = _id

	if (position.x === undefined) {
		throw Error('position.x === undefined', doc)
	}

	annotationList.appendChild(annotationBox)
	annotationElements.set(_id, [/*annotationPoint,*/ annotationBox])
}


function fetchAnnotations() {

	return localDB.allDocs({
		include_docs: true,
		attachments: true,
		startkey: 'annotation', /* using startkey and endkey is faster than querying by type */
		endkey: 'annotation\uffff' /* and keeps the cod more readable  */
	})
	.then(result => result.rows)
	.catch(err => console.error('error fetching annotations', err))
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
			console.log(annotation)
			addElementsForAnnotation(annotation)
		}

		// update the renderView with new annotation
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

	// perhaps also on change localDB to rebuildAnnotation elements?
	sync = PouchDB.sync(localDB, remoteDB, {
		live: true,
		retry: true
	}).on('change', function(info) {
		console.log('sync change!!')
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

	localDB.info().then((result) => {
		console.log('localDB info:', result)
		rebuildAnnotationElements()
	})



}


init()




/////////////////////////////////////////////
// OLD STUFF down there. maybe useful later!?
/////////////////////////////////////////////

// ipc.on('someNotification', function(annotation, status) {
// 	console.log('annotation with image arrived')
// })
