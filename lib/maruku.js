define(['./markdown', './gruber'], function(Markdown, Gruber) {
  function process_meta_hash( meta_string ) {
    var meta = split_meta_hash( meta_string ),
        attr = {};

    for ( var i = 0; i < meta.length; ++i ) {
      // id: #foo
      if ( /^#/.test( meta[ i ] ) ) {
        attr.id = meta[ i ].substring( 1 );
      }
      // class: .foo
      else if ( /^\./.test( meta[ i ] ) ) {
        // if class already exists, append the new one
        if ( attr['class'] ) {
          attr['class'] = attr['class'] + meta[ i ].replace( /./, " " );
        }
        else {
          attr['class'] = meta[ i ].substring( 1 );
        }
      }
      // attribute: foo=bar
      else if ( /=/.test( meta[ i ] ) ) {
        var s = meta[ i ].split( /=/ );
        attr[ s[ 0 ] ] = s[ 1 ];
      }
    }

    return attr;
  }

  function split_meta_hash( meta_string ) {
    var meta = meta_string.split( "" ),
        parts = [ "" ],
        in_quotes = false;

    while ( meta.length ) {
      var letter = meta.shift();
      switch ( letter ) {
        case " " :
          // if we're in a quoted section, keep it
          if ( in_quotes ) {
            parts[ parts.length - 1 ] += letter;
          }
          // otherwise make a new part
          else {
            parts.push( "" );
          }
          break;
        case "'" :
        case '"' :
          // reverse the quotes and move straight on
          in_quotes = !in_quotes;
          break;
        case "\\" :
          // shift off the next letter to be used straight away.
          // it was escaped so we'll keep it whatever it is
          letter = meta.shift();
        default :
          parts[ parts.length - 1 ] += letter;
          break;
      }
    }

    return parts;
  }

  return Markdown.registerDialect('Maruku', Gruber, function(dialect) {
    dialect.block.document_meta = function document_meta( block, next ) {
      // we're only interested in the first block
      if ( block.lineNumber > 1 ) return undefined;

      // document_meta blocks consist of one or more lines of `Key: Value\n`
      if ( ! block.match( /^(?:\w+:.*\n)*\w+:.*$/ ) ) return undefined;

      // make an attribute node if it doesn't exist
      if ( !Markdown.extract_attr( this.tree ) ) {
        this.tree.splice( 1, 0, {} );
      }

      var pairs = block.split( /\n/ );
      for ( var p in pairs ) {
        var m = pairs[ p ].match( /(\w+):\s*(.*)$/ ),
            key = m[ 1 ].toLowerCase(),
            value = m[ 2 ];

        this.tree[ 1 ][ key ] = value;
      }

      // document_meta produces no content!
      return [];
    };

    dialect.block.block_meta = function block_meta( block, next ) {
      // check if the last line of the block is an meta hash
      var m = block.match( /(^|\n) {0,3}\{:\s*((?:\\\}|[^\}])*)\s*\}$/ );
      if ( !m ) return undefined;

      // process the meta hash
      var attr = process_meta_hash( m[ 2 ] );
      // if we matched ^ then we need to apply meta to the previous block
      if ( m[ 1 ] === "" ) {
        var node = this.tree[ this.tree.length - 1 ],
            hash = Markdown.extract_attr( node );

        // if the node is a string (rather than JsonML), bail
        if ( typeof node === "string" ) return undefined;

        // create the attribute hash if it doesn't exist
        if ( !hash ) {
          hash = {};
          node.splice( 1, 0, hash );
        }

        // add the attributes in
        for ( var a in attr ) {
          hash[ a ] = attr[ a ];
        }

        // return nothing so the meta hash is removed
        return [];
      }

      // pull the meta hash off the block and process what's left
      var b = block.replace( /\n.*$/, "" ),
          result = this.processBlock( b, [] );

      // get or make the attributes hash
      var hash = Markdown.extract_attr( result[ 0 ] );
      if ( !hash ) {
        hash = {};
        result[ 0 ].splice( 1, 0, hash );
      }

      // attach the attributes to the block
      for ( a in attr ) {
        hash[ a ] = attr[ a ];
      }

      return result;
    };

    dialect.block.definition_list = function definition_list( block, next ) {
      // one or more terms followed by one or more definitions, in a single block
      var tight = /^((?:[^\s:].*\n)+):\s+([^]+)$/,
          list = [ "dl" ];

      // see if we're dealing with a tight or loose block
      if ( ( m = block.match( tight ) ) ) {
        // pull subsequent tight DL blocks out of `next`
        var blocks = [ block ];
        while ( next.length && tight.exec( next[ 0 ] ) ) {
          blocks.push( next.shift() );
        }

        for ( var b = 0; b < blocks.length; ++b ) {
          var m = blocks[ b ].match( tight ),
              terms = m[ 1 ].replace( /\n$/, "" ).split( /\n/ ),
              defns = m[ 2 ].split( /\n:\s+/ );

          for ( var i = 0; i < terms.length; ++i ) {
            list.push( [ "dt", terms[ i ] ] );
          }

          for ( i = 0; i < defns.length; ++i ) {
            // run inline processing over the definition
            list.push( [ "dd" ].concat( this.processInline( defns[ i ].replace( /(\n)\s+/, "$1" ) ) ) );
          }
        }
      }
      else {
        return undefined;
      }

      return [ list ];
    };

    dialect.inline[ "{:" ] = function inline_meta( text, matches, out ) {
      if ( !out.length ) {
        return [ 2, "{:" ];
      }

      // get the preceeding element
      var before = out[ out.length - 1 ];

      if ( typeof before === "string" ) {
        return [ 2, "{:" ];
      }

      // match a meta hash
      var m = text.match( /^\{:\s*((?:\\\}|[^\}])*)\s*\}/ );

      // no match, false alarm
      if ( !m ) {
        return [ 2, "{:" ];
      }

      // attach the attributes to the preceeding element
      var meta = process_meta_hash( m[ 1 ] ),
          attr = Markdown.extract_attr( before );

      if ( !attr ) {
        attr = {};
        before.splice( 1, 0, attr );
      }

      for ( var k in meta ) {
        attr[ k ] = meta[ k ];
      }

      // cut out the string and replace it with nothing
      return [ m[ 0 ].length, "" ];
    };
  });
});
