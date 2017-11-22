(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("NeonionRest", [], factory);
	else if(typeof exports === 'object')
		exports["NeonionRest"] = factory();
	else
		root["NeonionRest"] = factory();
})(this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
Object.defineProperty(__webpack_exports__, "__esModule", { value: true });
/* harmony export (immutable) */ __webpack_exports__["createTarget"] = createTarget;
/* harmony export (immutable) */ __webpack_exports__["fetchTarget"] = fetchTarget;
/* harmony export (immutable) */ __webpack_exports__["fetchTargets"] = fetchTargets;
/* harmony export (immutable) */ __webpack_exports__["createAnnotation"] = createAnnotation;
/* harmony export (immutable) */ __webpack_exports__["fetchAnnotation"] = fetchAnnotation;
/* harmony export (immutable) */ __webpack_exports__["fetchAnnotations"] = fetchAnnotations;
/* harmony export (immutable) */ __webpack_exports__["NeonionRestTarget"] = NeonionRestTarget;
// TODO: create Function or Class that wraps the API functions.
// wanted usage:
// let neonion = new Neonion(ip, port)
// neonion.fetchAnnotation(projectid, annotationid)
// maybe:
// let projectFoo = neonion.project(id)
// projectFoo.fetchAnnotation()


// TODO: Use indexedDB to cache project JSON, and annotation JSON
// for each operation
// So it is possible to instantly have annotation etc. on webapp start.

const putRequestBaseConfig = {
  method: "PUT",
  mode: 'cors',
  headers: new Headers({
		'Content-Type': 'application/json'
	})
};

// Default values for annotation JSON Object
const annotationMinBody = {
  // @context has to be wrapped in quotes in JSON because of the @
  '@context': 'http://www.w3.org/ns/anno.jsonld',
  type: 'Annotation'
}

function isContentType(response, type) {
  // Check if response body has correct content-type
  let contentType = response.headers.get("content-type");
  return contentType && contentType.includes(type);
}

/**
 * Try to fetch JSON for given url.
 * @param  {String} url url to fetch
 * @return {Object} return JSON object on success, otherwise undefined.
 */
async function fetchJSON(url) {

  try {
    let response = await fetch(url, {method: "GET"});
    if(response.status === 404) {
      console.warn(`Couldnt find JSON. Status 404 for url ${url}.\n See Response for details:`, response);
    } else if(isContentType(response, "application/json")) {
      return response.json();
    }  else {
      console.warn(`Could not fetch JSON for url ${url}\n See Response for details:`, response);
    }

  } catch (e) {
    console.warn(`Could not fetch fetching JSON for url ${url}\n:`, e);
    return;
  }

}

/**
 * try to create target with given id
 * @param  {[type]} id               [description]
 * @param  {String} [host="0.0.0.0"] [description]
 * @param  {Number} [port=8301]      [description]
 * @return {Promise->Object}         Promise that resolves into request result
 */
async function createTarget({id, info, host="0.0.0.0", port=8301}) {
  if(id === undefined) throw new Error('No ID specified for target creation.');
  let body = Object.assign({id: `${id}`}, info);
  let config = Object.assign({body: JSON.stringify(body)}, putRequestBaseConfig);
  let url = `http://${host}:${port}/targets/${id}`;
  let request = new Request(url, config);

  return fetch(request);
}

function formatID(id) {
  return id.replace(':', '%3A');
}


/**
 * try to fetch target with given id
 * @param  {Number} id
 * @param  {String} host
 * @param  {Number} port
 * @return {Promise->Object} Promise that resolves into the target Object
 */
async function fetchTarget({id, host, port}) {
  return fetchJSON(`http://${host}:${port}/targets/${formatID(id)}`);
}

/**
 *  If no ids given, return all targets,
 *  otherwise return Promise.All() for all given ids.
 * @param  {Array}  [ids=[]] Optional list of ids to fetch, if empty fetch all.
 * @param  {String} [host="0.0.0.0"]
 * @param  {Number} [port=8301]
 * @return {Promise->Array} Promise that resolves into an array of fetched targets
 */
async function fetchTargets({ids=[], host="0.0.0.0", port=8301}) {
  if(ids.length === 0) {
    return fetchJSON(`http://${host}:${port}/targets`);
  } else {
    let promises = ids.map(id => fetchTarget({id, host, port}));
    return Promise.all(promises);
  }
}

/**
 * Try to create Annotation with given ID
 * @param  {Number} id
 * @param  {String} [host="0.0.0.0"]
 * @param  {Number} [port=8301]
 * @return {Promise->Object} Promise that resolves into the request result
 */
async function createAnnotation({targetID, id, info={}, host="0.0.0.0", port=8301}) {

  if(id === undefined) throw new Error('No ID specified for annotation creation.');
  if(targetID === undefined) throw new Error('No target ID specified for annotation creation');

  let body = Object.assign({target: `${targetID}`, id: `${id}`}, annotationMinBody, info);
  let config = Object.assign({body: JSON.stringify(body)}, putRequestBaseConfig);
  let url = `http://${host}:${port}/targets/${formatID(targetID)}/annotations/${formatID(id)}`;
  let request = new Request(url, config);
  return fetch(request);
}

async function fetchAnnotation({targetID, id, host="0.0.0.0", port=8301}) {
  return fetchJSON(`http://${host}:${port}/targets/${formatID(targetID)}/annotations/${formatID(id)}`);
}

async function fetchAnnotations({targetID, ids=[], host="0.0.0.0", port=8301}) {
  if(ids.length === 0) {
    return fetchJSON(`http://${host}:${port}/targets/${formatID(targetID)}/annotations`);
  } else {
    let promises = ids.map(id => fetchAnnotation(targetID, id, host, port));
    return Promise.all(promises);
  }
}

/**
 * Wrapper Object for all API functions.
 * @param       {[type]} targetID         [description]
 * @param       {[type]} id               [description]
 * @param       {String} [host="0.0.0.0"] [description]
 * @param       {Number} [port=8301]      [description]
 * @constructor
 */
function NeonionRestTarget({host="0.0.0.0", port=8301, id}) {

  this.targetID = id;
  this.host = host;
  this.port = port;

  this.fetchAnnotation = function (id) {
    return fetchAnnotation({targetID: this.targetID, id, host: this.host, port: this.port});
  }

  this.fetchAnnotations = function (ids) {
    return fetchAnnotations({targetID: this.targetID, ids, host: this.host, port: this.port});
  }


  this.createAnnotation = function ({info, id}) {
    // Auto-add a free ID if none given
    // if(!id) id = generateFreeID()
    return createAnnotation({targetID: this.targetID, id, info, host: this.host, port: this.port});
  }

}


let NeonionRest = {createTarget, fetchTarget, fetchTargets, createAnnotation, fetchAnnotations, NeonionRestTarget};


/* harmony default export */ __webpack_exports__["default"] = (NeonionRest);


/***/ })
/******/ ]);
});