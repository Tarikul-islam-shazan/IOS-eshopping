"use strict";

// node modules
const requestify = require("requestify");
const Client = require("@googlemaps/google-maps-services-js").Client;
const GooglePlaces = require("google-places-web").default;
const KD = require("kd-tree-javascript");
const FS = require("fs");

// API key to use this API - cheap line of defence for API quota theft
const API_KEY = "tjAt3aXHyDsqDMDajasduifeaEfsdfoa";

// TomTom API variables
const TOMTOM_BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute/";
const TOMTOM_API_KEY = "hEKtjAtHSFuGbsoIGZGnfl8xaXDa5Aos";
const TOMTOM_ARGS = {
  instructionsType: "text",
  routeRepresentation: "polyline",
  computeTravelTimeFor: "all",
  sectionType: "traffic",
  avoid: "unpavedRoads",
  travelMode: "car",
  // departAt: '2020-12-29T13:34:00.000',
  arriveAt: '2020-12-29T13:50:00.000',
  key: TOMTOM_API_KEY,
};

// const TOMTOM_ARGS = {
//   instructionsType: "text",
//   language:"en-US",
//   vehicleHeading:"90",
//   sectionType: "traffic",
//   report:"effectiveSettings",
//   routeType:"eco",
//   traffic: "true",
//   avoid: "unpavedRoads",
//   travelMode: "car",
//   vehicleMaxSpeed:"120",
//   vehicleCommercial:"false",
//   vehicleEngineType:"combustion",
//   key: TOMTOM_API_KEY,
// };

// Google API variables
const GOOGLE_API_KEY = "AIzaSyDDMsq3uvAltfbqIw8_7E3zD-BocTeIl0c";

// template for GeoJSON MultiPoint
const GEOJSON_TEMPLATE = {
  type: "MultiPoint",
  coordinates: [],
};

// Radius of the nearby search
const RADIUS = 10000; // 1km

// The maximum distance from a route point that a camera can be before it is not considered a camera on the route
// Currently rather arbitrary as it uses Lat/Long values, but I found 0.00005 to be relatively ok :)
const MAX_CAMERA_DISTANCE = 0.00005;

// Google maps services client
const client = new Client({});

GooglePlaces.apiKey = GOOGLE_API_KEY;
GooglePlaces.debug = true;

// Load cameras JSON
var cameras = JSON.parse(FS.readFileSync("cameras.json"))["Cameras"];

/***
 *  Trafficly calculateroute API endpoint route.
 *
 *  Uses query parameters to perform a TomTom route calculation request,
 *  and uses the response to calculate the recommended routes to take.
 */
exports.calculate_route = async function (req, res) {
  let query = req.body;
  // let query = req.query;

  // check if api key is set and matches
  if (typeof query.key === "undefined")
    return res.json({ error: "key not defined" });
  if (query.key != API_KEY) return res.json({ error: "Invalid API key!" });

  // check if any of the coordinates weren't set
  if (typeof query.fromLong === "undefined")
    return res.json({ error: "fromLong not defined" });
  if (typeof query.fromLat === "undefined")
    return res.json({ error: "fromLat not defined" });
  if (typeof query.toLong === "undefined")
    return res.json({ error: "toLong not defined" });
  if (typeof query.toLat === "undefined")
    return res.json({ error: "toLat not defined" });

  // check if types weren't set
  if (typeof query.types === "undefined")
    return res.json({ error: "types not defined" });

  let types = query.types.split(":"); // split types separated by :

  // setup request url and args
  let url = `${TOMTOM_BASE_URL}${query.fromLat},${query.fromLong}:${query.toLat},${query.toLong}/json`;
  let args = TOMTOM_ARGS;

  // add depart/arrive args
  if (typeof query.departAt !== "undefined") args.departAt = query.departAt;
  if (typeof query.arriveAt !== "undefined") args.arriveAt = query.arriveAt;

  // make a request to TomTom's routing API to fetch route and traffic data
  requestify
    .get(url, {
      params: args,
    })
    .then(async function (routes) {
      let json = JSON.parse(routes.body); // parse JSON of the TomTom response
      let response = await processTomTomRoute(json, types); // process the TomTom data
      res.json(response); // respond with data
    })
    .catch(function (err) {
      console.log("ERROR");
      console.log(err);
      res.json(err);
      // you should also probably set up some logging here.
    });
};

/***
 * Processes TomTom Route data into the sections needed for Trafficly.
 */
async function processTomTomRoute(tomtomRoute, types) {
  //   console.log(`processTomTomRoute([tomtomRoute], ${types})`);

  let routePoints = tomtomRoute.routes[0].legs[0].points;
  let problemAreas = calculateProblemAreas(tomtomRoute);
  let cameras = getCamerasOnRoute(routePoints);
  // let nearByData =  await nearbySearch(parseFloat('52.5093'), parseFloat('13.42937'), ['food', 'cafe', 'bar', 'church', 'neighborhood']);
  // let customSearchResults = await customSearch(routePoints, ['food', 'cafe', 'bar'])
  // console.log(customSearchResults);

  let response;

  // if there are no problem areas, just return the route
  if (problemAreas.length == 0) {
    response = {
      route: tomtomRoute.routes[0],
      problemAreas: [],
      cameras: cameras,
      // customSearchResults: customSearchResults,
    };
  } else {
    // find all points of interest around start of problem areas
    problemAreas = await searchProblemAreas(routePoints, problemAreas, types);
    //TODO: uncomment
    response = {
      route: tomtomRoute.routes[0],
      problemAreas: problemAreas,
      cameras: cameras,
    };
  }

  return response;
}

/***
 * Takes in a TomTom Route API response and calculates the traffic problem areas.
 */
function calculateProblemAreas(tomtomRoute) {
  //   console.log("calculateProblemAreas([tomtomRoute])");

  if (typeof tomtomRoute.routes[0].sections === "undefined") return []; // if there are no problem areas, return none

  let traffic = tomtomRoute.routes[0].sections; // get "sections" containing traffic incidents

  var problems = [];

  // loop through each section and add a weight value by
  // multiplying number of points between start and finish
  // with the magnitude
  traffic.forEach(function (section) {
    section.weight =
      (section.endPointIndex - section.startPointIndex) *
      section.magnitudeOfDelay;

    problems.push(section);
  });

  // sort the values by weight
  problems.sort(function (a, b) {
    return b.weight - a.weight;
  });

  // return highest value
  return problems;
}

/***
 * Searches for points of interest around the start of each problem area
 */
async function searchProblemAreas(routePoints, problemAreas, types) {
  //TODO: reduce this to a limited amount or threshold if necessary
  for (let i = 0; i < problemAreas.length; i++) {
    // console.log(`Searching problem area ${i}`);
    problemAreas[i].radius = RADIUS;
    problemAreas[i].pointsOfInterest = await nearbySearch(
      routePoints[problemAreas[i].startPointIndex].latitude,
      routePoints[problemAreas[i].startPointIndex].longitude,
      types
    );
  }

  return problemAreas;
}

/***
 * Takes latitude and longitude coordiantes and performs a radius search using Google Places API.
 */
async function nearbySearch(latitude, longitude, types) {
  // console.log(`nearbySearch(${latitude}, ${longitude}, ${types})`);

  let results = [];

  await client
    .placesNearby({
      params: {
        location: [latitude, longitude],
        radius: RADIUS,
        key: GOOGLE_API_KEY,
      },
      timeout: 2000, // milliseconds
    })
    .then((r) => {
      results = r.data.results;
    })
    .catch((e) => {
      console.log("ERROR");
      console.log(e);
    });

  // filter places by types
  let filteredResults = filterResultsByType(results, types);

  return filteredResults;
}

/***
 * Filters out places by type due to Google limiting the type parameter to one.
 */
function filterResultsByType(results, types) {
  // console.log(`filterResultsByType([results](${results.length}), ${types} )`);

  // if no types were set, return all results unfiltered
  if (types.length == 0 || types[0] == "") return results;

  let filteredResults = [];

  // loop through results
  for (let i = 0; i < results.length; i++) {
    // loop through each type
    types.forEach(function (type) {
      // if the place contains the type, add it to the filtered list
      console.log(type);
      console.log(results[i].types);
      if (results[i].types.includes(type)){ 
        filteredResults.push(results[i])
      };
    });
  }

  // return filtered list of places that contain the types provided
  return filteredResults;
}

/***
 * Calculates the distance between a and b using the Harversine formula, used for K-D Tree search.
 */
function distance(a, b) {
  var lat1 = a.latitude,
    lon1 = a.longitude,
    lat2 = b.latitude,
    lon2 = b.longitude;
  var rad = Math.PI / 180;

  var dLat = (lat2 - lat1) * rad;
  var dLon = (lon2 - lon1) * rad;
  var lat1 = lat1 * rad;
  var lat2 = lat2 * rad;

  var x = Math.sin(dLat / 2);
  var y = Math.sin(dLon / 2);

  var a = x * x + y * y * Math.cos(lat1) * Math.cos(lat2);

  return Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/***
 * Looks up cameras on a route path using K-D Trees.
 */
function getCamerasOnRoute(routePoints) {
  var tree = new KD.kdTree(cameras, distance, ["latitude", "longitude"]);

  var camerasOnRoute = [];

  routePoints.forEach((point) => {
    var nearest = tree.nearest(point, 1, MAX_CAMERA_DISTANCE);

    //TODO: Add reference to route point to be able to represent the cameras in order

    // nearest.point = point;
    // if there was a camera within reach, add it
    if (nearest[0] != null) camerasOnRoute.push(nearest[0][0]);
  });

  // filter duplicates by converting to Set
  const uniqueSet = new Set(camerasOnRoute);
  return [...uniqueSet];
}


/**
 * Delete this, Used to test the funcationalitites in the program
 * @param {*} latitudeLongitudeList 
 * @param {*} types 
 */
async function customSearch(latitudeLongitudeList, types) {

  let customSearchResultList = [];

  //TODO: reduce this to a limited amount or threshold if necessary
  for (let i = 0; i < 10; i++) {
    // console.log(`Searching problem area ${i}`);
    try {
      if (latitudeLongitudeList[i].latitude) {
        Promise.resolve(
          customSearchResultList[i] = await nearbySearch(latitudeLongitudeList[i].latitude,
            latitudeLongitudeList[i].longitude,
            types)
        )
      }
    } catch (error) {
     return error; 
    }
    
  }

  return customSearchResultList;
}
