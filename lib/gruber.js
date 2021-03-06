define(['./markdown'], function(Markdown) {
  /**
   * Markdown.dialects.Gruber
   *
   * The default dialect that follows the rules set out by John Gruber's
   * markdown.pl as closely as possible. Well actually we follow the behaviour of
   * that script which in some places is not exactly what the syntax web page
   * says.
   **/
  return Markdown.registerDialect('Gruber', null, function(dialect) {
    dialect.block = {
      atxHeader: function atxHeader( block, next ) {
        var m = block.match( /^(#{1,6})\s*(.*?)\s*#*\s*(?:\n|$)/ );

        if ( !m ) return undefined;

        var header = [ "header", { level: m[ 1 ].length } ];
        Array.prototype.push.apply(header, this.processInline(m[ 2 ]));

        if ( m[0].length < block.length )
          next.unshift( Markdown.mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

        return [ header ];
      },

      setextHeader: function setextHeader( block, next ) {
        var m = block.match( /^(.*)\n([\-=])\2\2+(?:\n|$)/ );

        if ( !m ) return undefined;

        var level = ( m[ 2 ] === "=" ) ? 1 : 2;
        var header = [ "header", { level : level }, m[ 1 ] ];

        if ( m[0].length < block.length )
          next.unshift( Markdown.mk_block( block.substr( m[0].length ), block.trailing, block.lineNumber + 2 ) );

        return [ header ];
      },

      code: function code( block, next ) {
        // |    Foo
        // |bar
        // should be a code block followed by a paragraph. Fun
        //
        // There might also be adjacent code block to merge.

        var ret = [],
            re = /^(?: {0,3}\t| {4})(.*)\n?/,
            lines;

        // 4 spaces + content
        var m = block.match( re );

        if ( !m ) return undefined;

        block_search:
        do {
          // Now pull out the rest of the lines
          var b = this.loop_re_over_block(
                    re, block.valueOf(), function( m ) { ret.push( m[1] ); } );

          if (b.length) {
            // Case alluded to in first comment. push it back on as a new block
            next.unshift( Markdown.mk_block(b, block.trailing) );
            break block_search;
          }
          else if (next.length) {
            // Check the next block - it might be code too
            m = next[0].match( re );

            if ( !m ) break block_search;

            // Pull how how many blanks lines follow - minus two to account for .join
            ret.push ( block.trailing.replace(/[^\n]/g, '').substring(2) );

            block = next.shift();
          }
          else
            break block_search;
        } while (true);

        return [ [ "code_block", ret.join("\n") ] ];
      },

      horizRule: function horizRule( block, next ) {
        // this needs to find any hr in the block to handle abutting blocks
        var m = block.match( /^(?:([\s\S]*?)\n)?[ \t]*([\-_*])(?:[ \t]*\2){2,}[ \t]*(?:\n([\s\S]*))?$/ );

        if ( !m ) {
          return undefined;
        }

        var jsonml = [ [ "hr" ] ];

        // if there's a leading abutting block, process it
        if ( m[ 1 ] ) {
          jsonml.unshift.apply( jsonml, this.processBlock( m[ 1 ], [] ) );
        }

        // if there's a trailing abutting block, stick it into next
        if ( m[ 3 ] ) {
          next.unshift( Markdown.mk_block( m[ 3 ] ) );
        }

        return jsonml;
      },

      // There are two types of lists. Tight and loose. Tight lists have no whitespace
      // between the items (and result in text just in the <li>) and loose lists,
      // which have an empty line between list items, resulting in (one or more)
      // paragraphs inside the <li>.
      //
      // There are all sorts weird edge cases about the original markdown.pl's
      // handling of lists:
      //
      // * Nested lists are supposed to be indented by four chars per level. But
      //   if they aren't, you can get a nested list by indenting by less than
      //   four so long as the indent doesn't match an indent of an existing list
      //   item in the 'nest stack'.
      //
      // * The type of the list (bullet or number) is controlled just by the
      //    first item at the indent. Subsequent changes are ignored unless they
      //    are for nested lists
      //
      lists: (function( ) {
        // Use a closure to hide a few variables.
        var any_list = "[*+-]|\\d\\.",
            bullet_list = /[*+\-]/,
            number_list = /\d+\./,
            // Capture leading indent as it matters for determining nested lists.
            is_list_re = new RegExp( "^( {0,3})(" + any_list + ")[ \t]+" ),
            indent_re = "(?: {0,3}\\t| {4})";

        // TODO: Cache this regexp for certain depths.
        // Create a regexp suitable for matching an li for a given stack depth
        function regex_for_depth( depth ) {

          return new RegExp(
            // m[1] = indent, m[2] = list_type
            "(?:^(" + indent_re + "{0," + depth + "} {0,3})(" + any_list + ")\\s+)|" +
            // m[3] = cont
            "(^" + indent_re + "{0," + (depth-1) + "}[ ]{0,4})"
          );
        }
        function expand_tab( input ) {
          return input.replace( / {0,3}\t/g, "    " );
        }

        // Add inline content `inline` to `li`. inline comes from processInline
        // so is an array of content
        function add(li, loose, inline, nl) {
          if (loose) {
              li.push( [ "para" ].concat(inline) );
            return;
          }
          // Hmmm, should this be any block level element or just paras?
          var add_to = li[li.length -1] instanceof Array && li[li.length - 1][0] == "para"
                     ? li[li.length -1]
                     : li;

          // If there is already some content in this list, add the new line in
          if (nl && li.length > 1) inline.unshift(nl);

          for (var i=0; i < inline.length; i++) {
            var what = inline[i],
                is_str = typeof what == "string";
            if (is_str && add_to.length > 1 && typeof add_to[add_to.length-1] == "string" )
            {
              add_to[ add_to.length-1 ] += what;
            }
            else {
              add_to.push( what );
            }
          }
        }

        // contained means have an indent greater than the current one. On
        // *every* line in the block
        function get_contained_blocks( depth, blocks ) {

          var re = new RegExp( "^(" + indent_re + "{" + depth + "}.*?\\n?)*$" ),
              replace = new RegExp("^" + indent_re + "{" + depth + "}", "gm"),
              ret = [];

          while ( blocks.length > 0 ) {
            if ( re.exec( blocks[0] ) ) {
              var b = blocks.shift(),
                  // Now remove that indent
                  x = b.replace( replace, "");

              ret.push( Markdown.mk_block( x, b.trailing, b.lineNumber ) );
            }
            break;
          }
          return ret;
        }

        // passed to stack.forEach to turn list items up the stack into paras
        function paragraphify(s, i, stack) {
          var list = s.list;
          var last_li = list[list.length-1];

          if (last_li[1] instanceof Array && last_li[1][0] == "para") {
            return;
          }
          if (i+1 == stack.length) {
            // Last stack frame
            // Keep the same array, but replace the contents
            last_li.push( ["para"].concat( last_li.splice(1) ) );
          }
          else {
            var sublist = last_li.pop();
            last_li.push( ["para"].concat( last_li.splice(1) ), sublist );
          }
        }

        // The matcher function
        return function( block, next ) {
          var m = block.match( is_list_re );
          if ( !m ) return undefined;

          function make_list( m ) {
            var list = bullet_list.exec( m[2] )
                     ? ["bulletlist"]
                     : ["numberlist"];

            stack.push( { list: list, indent: m[1] } );
            return list;
          }


          var stack = [], // Stack of lists for nesting.
              list = make_list( m ),
              last_li,
              loose = false,
              ret = [ stack[0].list ];

          // Loop to search over block looking for inner block elements and loose lists
          loose_search:
          while( true ) {
            // Split into lines preserving new lines at end of line
            var lines = block.split( /(?=\n)/ );

            // We have to grab all lines for a li and call processInline on them
            // once as there are some inline things that can span lines.
            var li_accumulate = "";
            var nl = "";
            // Loop over the lines in this block looking for tight lists.
            tight_search:
            for (var line_no=0; line_no < lines.length; line_no++) {
              var l = lines[line_no].replace(/^\n/, function(n) { nl = n; return ""; });

              // TODO: really should cache this
              var line_re = regex_for_depth( stack.length );

              m = l.match( line_re );

              // We have a list item
              if ( m[1] !== undefined ) {
                // Process the previous list item, if any
                if ( li_accumulate.length ) {
                  add( last_li, loose, this.processInline( li_accumulate ), nl );
                  // Loose mode will have been dealt with. Reset it
                  loose = false;
                  li_accumulate = "";
                }

                m[1] = expand_tab( m[1] );
                var wanted_depth = Math.floor(m[1].length/4)+1;
                //print( "want:", wanted_depth, "stack:", stack.length);
                if ( wanted_depth > stack.length ) {
                  // Deep enough for a nested list outright
                  //print ( "new nested list" );
                  list = make_list( m );
                  last_li.push( list );
                  last_li = list[1] = [ "listitem" ];
                }
                else {
                  // We aren't deep enough to be strictly a new level. This is
                  // where Md.pl goes nuts. If the indent matches a level in the
                  // stack, put it there, else put it one deeper then the
                  // wanted_depth deserves.
                  var found = stack.some(function(s, i) {
                    if ( s.indent != m[1] ) return false;
                    list = s.list;     // Found the level we want
                    stack.splice(i+1); // Remove the others
                    //print("found");
                    return true;       // And stop looping
                  });

                  if (!found) {
                    wanted_depth++;
                    if (wanted_depth <= stack.length) {
                      stack.splice(wanted_depth);
                      //print("Desired depth now", wanted_depth, "stack:", stack.length);
                      list = stack[wanted_depth-1].list;
                    }
                    else {
                      //print ("made new stack for messy indent");
                      list = make_list(m);
                      last_li.push(list);
                    }
                  }

                  last_li = [ "listitem" ];
                  list.push(last_li);
                } // end depth of shenanigans
                nl = "";
              }

              // Add content
              if (l.length > m[0].length) {
                li_accumulate += nl + l.substr( m[0].length );
              }
            } // tight_search

            if ( li_accumulate.length ) {
              add( last_li, loose, this.processInline( li_accumulate ), nl );
              // Loose mode will have been dealt with. Reset it
              loose = false;
              li_accumulate = "";
            }

            // Look at the next block - we might have a loose list. Or an extra
            // paragraph for the current li
            var contained = get_contained_blocks( stack.length, next );

            // Deal with code blocks or properly nested lists
            if (contained.length > 0) {
              // Make sure all listitems up the stack are paragraphs
              stack.forEach( paragraphify, this );

              last_li.push.apply( last_li, this.toTree( contained, [] ) );
            }

            var next_block = next[0] && next[0].valueOf() || "";

            if ( next_block.match(is_list_re) || next_block.match( /^ / ) ) {
              block = next.shift();

              // Check for an HR following a list: features/lists/hr_abutting
              var hr = this.dialect.block.horizRule( block, next );

              if (hr) {
                ret.push.apply(ret, hr);
                break;
              }

              // Make sure all listitems up the stack are paragraphs
              stack.forEach( paragraphify , this );

              loose = true;
              continue loose_search;
            }
            break;
          } // loose_search

          return ret;
        };
      })(),

      blockquote: function blockquote( block, next ) {
        if ( !block.match( /^>/m ) )
          return undefined;

        var jsonml = [];

        // separate out the leading abutting block, if any
        if ( block[ 0 ] != ">" ) {
          var lines = block.split( /\n/ ),
              prev = [];

          // keep shifting lines until you find a crotchet
          while ( lines.length && lines[ 0 ][ 0 ] != ">" ) {
              prev.push( lines.shift() );
          }

          // reassemble!
          block = lines.join( "\n" );
          jsonml.push.apply( jsonml, this.processBlock( prev.join( "\n" ), [] ) );
        }

        // if the next block is also a blockquote merge it in
        while ( next.length && next[ 0 ][ 0 ] == ">" ) {
          var b = next.shift();
          block += block.trailing + b;
          block.trailing = b.trailing;
        }

        // Strip off the leading "> " and re-process as a block.
        var input = block.replace( /^> ?/gm, '' ),
            old_tree = this.tree;
        jsonml.push( this.toTree( input, [ "blockquote" ] ) );

        return jsonml;
      },

      referenceDefn: function referenceDefn( block, next) {
        var re = /^\s*\[(.*?)\]:\s*(\S+)(?:\s+(?:(['"])(.*?)\3|\((.*?)\)))?\n?/;
        // interesting matches are [ , ref_id, url, , title, title ]

        if ( !block.match(re) )
          return undefined;

        // make an attribute node if it doesn't exist
        if ( !Markdown.extract_attr( this.tree ) ) {
          this.tree.splice( 1, 0, {} );
        }

        var attrs = Markdown.extract_attr( this.tree );

        // make a references hash if it doesn't exist
        if ( attrs.references === undefined ) {
          attrs.references = {};
        }

        var b = this.loop_re_over_block(re, block, function( m ) {

          if ( m[2] && m[2][0] == '<' && m[2][m[2].length-1] == '>' )
            m[2] = m[2].substring( 1, m[2].length - 1 );

          var ref = attrs.references[ m[1].toLowerCase() ] = {
            href: m[2]
          };

          if (m[4] !== undefined)
            ref.title = m[4];
          else if (m[5] !== undefined)
            ref.title = m[5];

        } );

        if (b.length)
          next.unshift( Markdown.mk_block( b, block.trailing ) );

        return [];
      },

      para: function para( block, next ) {
        // everything's a para!
        return [ ["para"].concat( this.processInline( block ) ) ];
      }
    };

    dialect.inline = {
      __call__: function inline( text, patterns ) {
        // Hmmm - should this function be directly in Md#processInline, or
        // conversely, should Md#processBlock be moved into block.__call__ too
        var out = [ ],
            m,
            // Look for the next occurange of a special character/pattern
            re = new RegExp( "([\\s\\S]*?)(" + (patterns.source || patterns) + ")", "g" ),
            lastIndex = 0;

        //D:var self = this;
        function add(x) {
          if (typeof x == "string" && typeof out[out.length-1] == "string")
            out[ out.length-1 ] += x;
          else
            out.push(x);
        }

        while ( ( m = re.exec(text) ) !== null) {
          if ( m[1] ) add( m[1] ); // Some un-interesting text matched
          else        m[1] = { length: 0 }; // Or there was none, but make m[1].length == 0

          var res;
          if ( m[2] in this.dialect.inline ) {
            res = this.dialect.inline[ m[2] ].call(
                      this,
                      text.substr( m.index + m[1].length ), m, out );
          }
          // Default for now to make dev easier. just slurp special and output it.
          res = res || [ m[2].length, m[2] ];

          var len = res.shift();
          // Update how much input was consumed
          re.lastIndex += ( len - m[2].length );

          // Add children
          res.forEach(add);

          lastIndex = re.lastIndex;
        }

        // Add last 'boring' chunk
        if ( text.length > lastIndex )
          add( text.substr( lastIndex ) );

        return out;
      },

      "\\": function escaped( text ) {
        // [ length of input processed, node/children to add... ]
        // Only esacape: \ ` * _ { } [ ] ( ) # * + - . !
        if ( text.match( /^\\[\\`\*_{}\[\]()#\+.!\-]/ ) )
          return [ 2, text[1] ];
        else
          // Not an esacpe
          return [ 1, "\\" ];
      },

      "![": function image( text ) {
        // ![Alt text](/path/to/img.jpg "Optional title")
        //      1          2            3       4         <--- captures
        var m = text.match( /^!\[(.*?)\][ \t]*\([ \t]*(\S*)(?:[ \t]+(["'])(.*?)\3)?[ \t]*\)/ );

        if ( m ) {
          if ( m[2] && m[2][0] == '<' && m[2][m[2].length-1] == '>' )
            m[2] = m[2].substring( 1, m[2].length - 1 );

          m[2] == this.dialect.inline.__call__.call( this, m[2], /\\/ )[0];

          var attrs = { alt: m[1], href: m[2] || "" };
          if ( m[4] !== undefined)
            attrs.title = m[4];

          return [ m[0].length, [ "img", attrs ] ];
        }

        // ![Alt text][id]
        m = text.match( /^!\[(.*?)\][ \t]*\[(.*?)\]/ );

        if ( m ) {
          // We can't check if the reference is known here as it likely wont be
          // found till after. Check it in md tree->hmtl tree conversion
          return [ m[0].length, [ "img_ref", { alt: m[1], ref: m[2].toLowerCase(), text: m[0] } ] ];
        }

        // Just consume the '!['
        return [ 2, "![" ];
      },

      "[": function link( text ) {
        // [link text](/path/to/img.jpg "Optional title")
        //      1          2            3       4         <--- captures
        var m = text.match( /^\[([\s\S]*?)\][ \t]*\([ \t]*(\S+)(?:[ \t]+(["'])(.*?)\3)?[ \t]*\)/ );
        var attrs;

        if ( m ) {
          if ( m[2] && m[2][0] == '<' && m[2][m[2].length-1] == '>' )
            m[2] = m[2].substring( 1, m[2].length - 1 );

          // Process escapes only
          m[2] = this.dialect.inline.__call__.call( this, m[2], /\\/ )[0];

          attrs = { href: m[2] || "" };
          if ( m[4] !== undefined)
            attrs.title = m[4];

          var link = [ "link", attrs ];
          Array.prototype.push.apply( link, this.processInline( m[1] ) );
          return [ m[0].length, link ];
        }

        // [Alt text][id]
        // [Alt text] [id]
        // [id]
        m = text.match( /^\[([\s\S]*?)\](?: ?\[(.*?)\])?/ );

        if ( m ) {
          // [id] case, text == id
          if ( m[2] === undefined || m[2] === "" ) m[2] = m[1];

          attrs = { ref: m[ 2 ].toLowerCase(),  original: m[ 0 ] };
          link = [ "link_ref", attrs ];
          Array.prototype.push.apply( link, this.processInline( m[1] ) );

          // We can't check if the reference is known here as it likely wont be
          // found till after. Check it in md tree->hmtl tree conversion.
          // Store the original so that conversion can revert if the ref isn't found.
          return [
            m[ 0 ].length,
            link
          ];
        }

        // Just consume the '['
        return [ 1, "[" ];
      },


      "<": function autoLink( text ) {
        var m;

        if ( ( m = text.match( /^<(?:((https?|ftp|mailto):[^>]+)|(.*?@.*?\.[a-zA-Z]+))>/ ) ) !== null ) {
          if ( m[3] ) {
            return [ m[0].length, [ "link", { href: "mailto:" + m[3] }, m[3] ] ];

          }
          else if ( m[2] == "mailto" ) {
            return [ m[0].length, [ "link", { href: m[1] }, m[1].substr("mailto:".length ) ] ];
          }
          else
            return [ m[0].length, [ "link", { href: m[1] }, m[1] ] ];
        }

        return [ 1, "<" ];
      },

      "`": function inlineCode( text ) {
        // Inline code block. as many backticks as you like to start it
        // Always skip over the opening ticks.
        var m = text.match( /(`+)(([\s\S]*?)\1)/ );

        if ( m && m[2] )
          return [ m[1].length + m[2].length, [ "inlinecode", m[3] ] ];
        else {
          // TODO: No matching end code found - warn!
          return [ 1, "`" ];
        }
      },

      "  \n": function lineBreak( text ) {
        return [ 3, [ "linebreak" ] ];
      }
    };

    // Meta Helper/generator method for em and strong handling
    function strong_em( tag, md ) {

      var state_slot = tag + "_state",
          other_slot = tag == "strong" ? "em_state" : "strong_state";

      function CloseTag(len) {
        this.len_after = len;
        this.name = "close_" + md;
      }

      return function ( text, orig_match ) {

        if (this[state_slot][0] == md) {
          // Most recent em is of this type
          //D:this.debug("closing", md);
          this[state_slot].shift();

          // "Consume" everything to go back to the recrusion in the else-block below
          return[ text.length, new CloseTag(text.length-md.length) ];
        }
        else {
          // Store a clone of the em/strong states
          var other = this[other_slot].slice(),
              state = this[state_slot].slice();

          this[state_slot].unshift(md);

          //D:this.debug_indent += "  ";

          // Recurse
          var res = this.processInline( text.substr( md.length ) );
          //D:this.debug_indent = this.debug_indent.substr(2);

          var last = res[res.length - 1];

          var check = this[state_slot].shift();
          if (last instanceof CloseTag) {
            res.pop();
            // We matched! Huzzah.
            var consumed = text.length - last.len_after;
            return [ consumed, [ tag ].concat(res) ];
          }
          else {
            // Restore the state of the other kind. We might have mistakenly closed it.
            this[other_slot] = other;
            this[state_slot] = state;

            // We can't reuse the processed result as it could have wrong parsing contexts in it.
            return [ md.length, md ];
          }
        }
      }; // End returned function
    }

    dialect.inline["**"] = strong_em("strong", "**");
    dialect.inline["__"] = strong_em("strong", "__");
    dialect.inline["*"]  = strong_em("em", "*");
    dialect.inline["_"]  = strong_em("em", "_");
  });
});
