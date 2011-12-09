var markdown = require('../lib/markdown');

function clone_array( input ) {
  eval( "var tmp = " + input.toSource() );
  return tmp;
}

exports.arguments_untouched = function(test) {
  var input = "A [link][id] by id.\n\n[id]: http://google.com",
      tree = markdown.parse( input ),
      clone = clone_array( tree );


  var output = markdown.toHTML( tree );

  test.deepEqual( tree, clone, "tree isn't modified" );

  // We had a problem where we would accidentally remove the references
  // property from the root. We want to check the output is the same when
  // called twice.
  test.deepEqual( markdown.toHTML( tree ), output, "output is consistent" );
  test.done();
};
