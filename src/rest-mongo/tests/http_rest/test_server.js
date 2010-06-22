
require.paths.unshift(__dirname + '/../../../../vendor/nodetk/src');
require.paths.unshift(__dirname + '/../../../');

var http = require("http"),
    sys = require("sys"),

    CLB = require("nodetk/orchestration/callbacks");
    assert = require("nodetk/testing/custom_assert");

    rest_server = require('rest-mongo/http_rest/server'),
    rest_mongo = require('rest-mongo/core'),
    mongo_backend = require('rest-mongo/mongo_backend'),
    schema = require('rest-mongo/tests/schema').schema;



var server;
var client;
var backend = mongo_backend.get_backend({db_name: 'test-rest-mongo'});
    RFactory = rest_mongo.getRFactory(schema, backend);


(function() {
  // init some stuff
  server = http.createServer();
  rest_server.plug(server, schema, RFactory);
  server.listen(8555);
  // TODO: close the server at the end of the tests.
  client = http.createClient(8555, '127.0.0.1');
  client.addListener('error', function(err) {
    sys.puts(err.message, err.stack);
  });
})();


var DATA = {},
    R;
exports.setup = function(callback) {
  R = RFactory();
  var waiter_clear = CLB.get_waiter(2, function() {
    DATA.p1 = new R.Person({firstname: "Pierre"});
    DATA.p2 = new R.Person({firstname: "Kevin"});
    R.save([DATA.p1, DATA.p2], callback);
  });
  R.Person.clear_all(waiter_clear);
  R.Animal.clear_all(waiter_clear);
};


var expected_header = {
  'transfer-encoding': 'chunked',
  'connection': 'close'
};

var expected_header_json = {
  'content-type': 'application/json',
  'transfer-encoding': 'chunked',
  "connection": "close"
};


exports.tests = [


['Index on Person', 3, function() {
  var request = client.request('GET', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      var d1 = JSON.stringify(data);
      var d2 = JSON.stringify([DATA.p1.json(), DATA.p2.json()]);
      var d3 = JSON.stringify([DATA.p2.json(), DATA.p1.json()]);
      assert.ok(d1 == d2 || d1 == d3);
      // The order of returned object is not determinist enough, so we can not
      // do that:
      //assert.deepEqual(data, [DATA.p1.json(), DATA.p2.json()]);
    });
  });
  request.end();
}],


['Index on Animals (no data)', 3, function() {
  var request = client.request('GET', '/animals', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, []);
    });
  });
  request.end();
}],


['GET existing obj', 3, function() {
  var request = client.request('GET', '/people/' + DATA.p1.id, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, DATA.p1.json());
    });
  });
  request.end();
}],


['GET non existing obj', 2, function() {
  var request = client.request('GET', '/people/A000000000000000000001', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['GET non existing obj bad id format', 2, function() {
  var request = client.request('GET', '/people/titi', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['GETs all existing obj', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id;
  var request = client.request('GET', url, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, [DATA.p1.json(), DATA.p2.json()]);
    });
  });
  request.end();
}],


['GETs missing obj', 3, function() {
  var url = '/people/' + DATA.p1.id + ',toto';
  var request = client.request('GET', url, {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header_json);
    rest_server.get_body_json(response, function(data) {
      assert.deepEqual(data, [DATA.p1.json()]);
    });
  });
  request.end();
}],


['POST /people', 5,function() {
  var request = client.request('POST', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.headers, expected_header);
    rest_server.get_body_json(response, function(data) {
      // The object is sent back as answer, it now has an id.
      assert.ok(data.id);
    });
    R.Person.index(function(data) {
      assert.equal(data.length, 3);
      var p = data.filter(function(obj){return obj.firstname == 'Luc'})[0];
      assert.ok(p.id);
    });
  });
  request.write(JSON.stringify({firstname: 'Luc'}));
  request.end();
}],


['POST /people + irrelevant data', 5,function() {
  var request = client.request('POST', '/people', {});
  request.addListener('response', function(response) {
    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.headers, expected_header);
    R.Person.index(function(data) {
      assert.equal(data.length, 3);
      var p = data.filter(function(obj){return obj.firstname == 'Luc'})[0];
      assert.ok(p.id);
      // Check irrelevant data is not kept:
      assert.ok(!p.weapon);
    });
  });
  request.write(JSON.stringify({firstname: 'Luc', weapon: 'knife'}));
  request.end();
}],


['PUT /people/id1', 3, function() {
  var request = client.request('PUT', '/people/' + DATA.p1.id, {});
  request.write(JSON.stringify({firstname: 'anonymous'}));
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.get({ids: DATA.p1.id}, function(pierre) {
      assert.equal(pierre.firstname, 'anonymous');
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['PUT /people/id1,id2', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id;
  var request = client.request('PUT', url, {});
  request.write(JSON.stringify({firstname: 'Clone'}));
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.get({ids: [DATA.p1.id, DATA.p2.id]}, function(persons) {
      persons = persons.map(function(p) {return p.json()});
      var expected = [{firstname: 'Clone', id: DATA.p1.id},
                      {firstname: 'Clone', id: DATA.p2.id}]
      assert.deepEqual(persons, expected);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['PUT /people/id1,id2,toto', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id + ',toto';
  var request = client.request('PUT', url, {});
  request.write(JSON.stringify({firstname: 'Clone'}));
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.get({ids: [DATA.p1.id, DATA.p2.id]}, function(persons) {
      persons = persons.map(function(p) {return p.json()});
      var expected = [{firstname: 'Clone', id: DATA.p1.id},
                      {firstname: 'Clone', id: DATA.p2.id}]
      assert.deepEqual(persons, expected);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['DELETE /people/id1', 4, function() {
  var request = client.request('DELETE', '/people/' + DATA.p1.id, {});
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.index(function(data) {
      assert.equal(data.length, 1);
    });
    R.Person.get({ids: DATA.p1.id}, function(pierre) {
      assert.equal(pierre, null);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['DELETE /people/id1,id2', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id;
  var request = client.request('DELETE', url, {});
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.index(function(data) {
      assert.equal(data.length, 0);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


['DELETE /people/id1,id2,toto', 3, function() {
  var url = '/people/' + DATA.p1.id + ',' + DATA.p2.id + ',toto';
  var request = client.request('DELETE', url, {});
  request.addListener('response', function(response) {
    R.Person.clear_cache();
    R.Person.index(function(data) {
      assert.equal(data.length, 0);
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.headers, expected_header);
  });
  request.end();
}],


];

