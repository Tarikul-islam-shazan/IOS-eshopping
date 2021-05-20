"use strict";
module.exports = function(app) {
  var calculate = require("../controllers/calculatecontroller");
  var calculateRoute = require("../controllers/calculateroutecontroller");

  // todoList Routes
  app.route("/calculateroutebb").get(calculate.calculate_route);
  app.route("/calculateroute").get(calculateRoute.calculate_route);

  /* app
    .route("/tasks/:taskId")
    .get(todoList.read_a_task)
    .put(todoList.update_a_task)
    .delete(todoList.delete_a_task); */
};
