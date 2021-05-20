"use strict";

// node modules
const requestify = require("requestify");
const GeoJSON = require("geojson");
const RouteBoxer = require("geojson.lib.routeboxer");
const Client = require("@googlemaps/google-maps-services-js").Client;
const GooglePlaces = require("google-places-web").default;

const GeoJSONHint = require("@mapbox/geojsonhint");

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
  key: TOMTOM_API_KEY
};

// Google API variables
const GOOGLE_API_KEY = "AIzaSyDDMsq3uvAltfbqIw8_7E3zD-BocTeIl0c";

// template for GeoJSON MultiPoint
const GEOJSON_TEMPLATE = {
  type: "MultiPoint",
  coordinates: []
};

// distance of the RouteBoxer search
const DISTANCE = 0.5; // km

const routeBoxer = new RouteBoxer();
const client = new Client({});

GooglePlaces.apiKey = GOOGLE_API_KEY;
GooglePlaces.debug = true;

//Sains 54.051945, -2.797260

/***
 *  Trafficly calculateroute API endpoint route.
 *
 *  Uses query parameters to perform a TomTom route calculation request,
 *  and uses the response to calculate the recommended routes to take.
 */
exports.calculate_route = async function(req, res) {
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
      params: args
    })
    .then(async function(routes) {
      let json = JSON.parse(routes.body); // parse JSON of the TomTom response
      let response = await processTomTomRoute(json, types); // process the TomTom data
      res.json(response); // respond with data
    })
    .catch(function(err) {
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

  let response;

  // if there are no problem areas, just return the route
  if (problemAreas.length == 0) {
    response = {
      route: tomtomRoute.routes[0],
      problemAreas: [],
      pointsOfInterest: []
    };
  } else {
    // get all points between start of route and start of biggest problem area
    let pathToProblem = routePoints.slice(0, problemAreas[0].startPointIndex);

    // generate GeoJSON from problem path
    let geo = generateGeoJSON(pathToProblem);

    // generate bounding box of the route
    let box = routeBoxer.box(geo, DISTANCE);

    // find all points of interest along route
    let pointsOfInterest = await searchBounds(box, types);

    response = {
      route: tomtomRoute.routes[0],
      problemAreas: problemAreas,
      pointsOfInterest: pointsOfInterest,
      geo: geo,
      box: box
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
  traffic.forEach(function(section) {
    section.weight =
      (section.endPointIndex - section.startPointIndex) *
      section.magnitudeOfDelay;

    problems.push(section);
  });

  // sort the values by weight
  problems.sort(function(a, b) {
    return b.weight - a.weight;
  });

  // return highest value
  return problems;
}

/***
 * Uses problem areas to calculate GeoJSON
 */
function generateGeoJSON(pathToProblem) {
  //   console.log("generateGeoJSON()");

  let geoJson = GEOJSON_TEMPLATE;

  pathToProblem.forEach(function(point) {
    geoJson.coordinates.push([point.longitude, point.latitude]);
  });

  return geoJson;
}

/***
 * Uses bounds from Box Router function, and types, to search for points of interest on a route.
 */
async function searchBounds(bounds, types) {
  //   console.log(`searchBounds([${bounds.bbox}], ${types})`);

  let results = [];

  for (var i = 0; i < bounds.length; i++) {
    // perform search on the bound and save the result
    let result = await nearbySearch(bounds[i], types);
    results = results.concat(result);
  }

  return results;
}

/***
 * Takes in a bounding box bounds and calculates the mid point of the values. This is then used to perform a nearby search.
 */
async function nearbySearch(bounds, types) {
  //   console.log(`nearbySearch([${bounds.bbox}], ${types})`);

  // calculate centre of bounds
  let midLat = (bounds.bbox[1] + bounds.bbox[3]) / 2;
  let midLong = (bounds.bbox[0] + bounds.bbox[2]) / 2;

  // TODO: This currently just draws circles in the centre of the bounds. Better radius calculation is needed.
  let radius = DISTANCE * 1000;

  let results = [];

  await client
    .placesNearby({
      params: {
        location: [midLat, midLong],
        radius: radius,
        key: GOOGLE_API_KEY
      },
      timeout: 2000 // milliseconds
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
  //   console.log(`filterResultsByType([results](${results.length}), ${types} )`);

  let filteredResults = [];

  // loop through results
  for (let i = 0; i < results.length; i++) {
    // loop through each type
    types.forEach(function(type) {
      // if the place contains the type, add it to the filtered list
      if (results[i].types.includes(type)) filteredResults.push(results[i]);
    });
  }

  // return filtered list of places that contain the types provided
  return filteredResults;
}
