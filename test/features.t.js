requirejs = require('requirejs');
requirejs.config({
  nodeRequire: require,
  baseUrl: 'lib'
});

function test_dialect( dialect, features ) {
  var dialect_test = exports[ "test_" + dialect ] = {};

  for ( var f in features ) {
    ( function( feature ) {
      dialect_test[ "test_" + feature ] = function(test) {
        var test_path = path + feature + "/";

        // grab all the test files in this feature
        var tests = fs.list( test_path );

        // filter to only the raw files
        tests = tests.filter( function( x ) {return x.match( /\.text$/ ); } );

        // remove the extensions
        tests = tests.map( function( x ) {return x.replace( /\.text$/, "" ); } );

        for ( var t in tests ) {
          // load the raw text
          var test_name = tests[ t ].substring( tests[ t ].lastIndexOf( "/" ) + 1 ),
              text = slurpFile( test_path + tests[ t ] + ".text" );

          // load the target output
          if ( fs.isFile( test_path + tests[ t ] + ".json" ) ) {
            try {
              var json_text = slurpFile( test_path + tests[ t ] + ".json" );
              var json = JSON.parse( json_text );
              requirejs(['markdown', dialect.toLowerCase()], function(markdown) {
                var output = markdown.toHTMLTree( text, dialect );
                test.deepEqual( output, json, test_name );
              });
            }
            catch( e ) {
              test.ok( 0, "Failed with error on " + test_name + ": " + e );
              if ( e.stack )
                console.log( e.stack );
            }
          }
          else {
            asserts.ok( 0, "No target output for " + test_name );
          }
        }
        test.done();
      };
    } )( features[ f ] );
  }
}

// Setup
var path = __dirname + "/features/";
var n_fs = require( 'fs' );
var fs = {
  list: n_fs.readdirSync,
  rawOpen: n_fs.openSync,
  isFile: function( f ) {
    return n_fs.statSync( f ).isFile();
  }
};
var slurpFile = function( f ) {
  return n_fs.readFileSync( f, 'utf8' );
};

// Dialects
var dialects = {};
dialects.Gruber = [
  "blockquotes",
  "code",
  "emphasis",
  "headers",
  "horizontal_rules",
  "images",
  "linebreaks",
  "links",
  "lists"
];
dialects.Maruku = dialects.Gruber.slice( 0 );
dialects.Maruku.push( "meta", "definition_lists" );

dialects.Instiki = dialects.Gruber.slice( 0 );
dialects.Instiki.push( "wiki" );

// Create tests
for (var d in dialects) {
  test_dialect(d, dialects[ d ]);
}
